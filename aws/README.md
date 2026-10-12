# AWS backend (M1 + M2)

Deployed in **ap-southeast-1**, account 271992001572. Each function is a single-file
`index.py` (`index.handler`, python3.12) using only boto3 + stdlib, all sharing the
`flight-lambda-role` IAM role. The deployed code is built from these files.

| Function | Trigger | Job |
|---|---|---|
| `flight-save-subscription` | API Gateway `POST /subscribe` | Upsert a `subscriptions` row (email, route, TWD target) |
| `flight-list-subscriptions` | API Gateway `GET /subscriptions?email=` | Return the user's rows |
| `flight-parser-wrapper` | EventBridge `flight-price-check` (rate 30 min) | Read `flight-routes.json` from S3, fan out to the parser |
| `flight-parser` | async invoke | Fetch next month's cheapest fare (TWD gate, USD best-effort), enqueue matches to `flight-fare-queue` |
| `flight-fare-notification` | SQS `flight-fare-queue` | Dedup against `notification_history`, email via Resend |
| `flight-ecpay-return` | `POST /ecpay-return` (ECPay ReturnURL) | Verify CheckMacValue, first charge → `active` + `current_period_end`, enqueue welcome |
| `flight-ecpay-period` | `POST /ecpay-period` (ECPay PeriodReturnURL) | Verify CMV, renewal extends `current_period_end`; 6 failed renewals → `expired` |
| `flight-ecpay-result` | `ANY /ecpay-result` (ECPay OrderResultURL) | 302 the browser POST to `<site>/app?purchase=success\|failed` (a static SPA would 405) |
| `flight-cancel-subscription` | `POST /cancel` | ECPay `CreditCardPeriodAction Action=Cancel`, row → `cancelled` (kept until `current_period_end`), enqueue cancel |
| `flight-status-notification` | SQS `flight-status-queue` | One consumer for welcome/cancel emails, routed by `event_type`, sent once per order |

## M2 paywall (ECPay 信用卡定期定額)

- `POST /subscribe` writes `subscription_status=pending_payment` + a fresh `merchant_trade_no` and returns ECPay's
  auto-submit checkout page (`text/html`). A paid-through row (`active`, or `cancelled` before `current_period_end`)
  only gets its target price updated and the response is JSON.
- Lifecycle: `pending_payment → active → cancelled (grace) → expired`. Only the CMV-verified callbacks write `active`;
  `SimulatePaid=1` callbacks are acked with `1|OK` but never grant access.
- The parser serves `active` rows and `cancelled` rows still inside their period, and lazily flips lapsed
  `cancelled` rows to `expired`. Rows saved before M2 have no status, so they get no alerts until paid.
- Price and merchant come from the `flight/ecpay` secret (`amount`, `env`=stage|prod); nothing is hard-coded.
  `GET /subscriptions` also returns `monthly_price` from it for the UI.
- `_shared/ecpay.py` (CheckMacValue, form parsing, `1|OK`, period math) is zipped next to `index.py` for every
  Lambda that imports it: `zip -jX fn.zip aws/<fn>/index.py aws/_shared/ecpay.py`.

- HTTP API: `https://b4didc2vx8.execute-api.ap-southeast-1.amazonaws.com` (CORS `*`)
- Config bucket: `flight-config-271992001572` (`flight-routes.json`, `lambda/*.zip`)
- Secrets: `flight/travelpayouts`, `flight/resend`, `flight/ecpay`
- Queues: `flight-fare-queue`, `flight-status-queue` (VisibilityTimeout 180)

**Redeploy one function:** `zip -jX fn.zip aws/<fn>/index.py` (plus `aws/_shared/ecpay.py` where imported), upload to
`s3://flight-config-271992001572/lambda/<key>.zip`, check the S3 ETag equals the local
md5, then `aws lambda update-function-code --function-name <fn> --s3-bucket … --s3-key …`.

**Known limitation:** `GET /subscriptions`, `POST /subscribe` and `POST /cancel` trust the
client-supplied email (no auth). Production would verify the Supabase JWT first.
