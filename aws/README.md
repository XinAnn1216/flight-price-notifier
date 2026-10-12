# AWS backend (M1)

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

- HTTP API: `https://b4didc2vx8.execute-api.ap-southeast-1.amazonaws.com` (CORS `*`)
- Config bucket: `flight-config-271992001572` (`flight-routes.json`, `lambda/*.zip`)
- Secrets: `flight/travelpayouts`, `flight/resend`

**Redeploy one function:** `zip -jX fn.zip aws/<fn>/index.py`, upload to
`s3://flight-config-271992001572/lambda/<key>.zip`, check the S3 ETag equals the local
md5, then `aws lambda update-function-code --function-name <fn> --s3-bucket … --s3-key …`.

**Known M1 limitation:** `GET /subscriptions` and `POST /subscribe` trust the
client-supplied email (no auth). Production would verify the Supabase JWT first.
