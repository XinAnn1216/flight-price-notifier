import html, json, os, re, secrets, string
import boto3
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation
import ecpay

PLANS = {"tokyo": {"origin": "TPE", "destination": "TYO"}, "seoul": {"origin": "TPE", "destination": "SEL"},
         "london": {"origin": "TPE", "destination": "LON"}}
CITY = {"TYO": "東京", "SEL": "首爾", "LON": "倫敦"}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TW = timezone(timedelta(hours=8))  # MerchantTradeDate is Taiwan local time
ddb = boto3.resource("dynamodb").Table("subscriptions")


def resp(code, body):
    return {"statusCode": code, "headers": {"content-type": "application/json"}, "body": json.dumps(body)}


def in_service(row):
    """Paid-through rows only get an in-place target update; anyone else goes to the cashier."""
    st = (row or {}).get("subscription_status")
    return st == "active" or (st == "cancelled" and (row.get("current_period_end") or "") >= ecpay.now_ts())


def trade_no():
    # <=20 chars, alphanumeric, unique per checkout attempt
    rnd = "".join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(5))
    return "FPN" + datetime.now(TW).strftime("%y%m%d%H%M%S") + rnd


def checkout_form(event, email, route, mtn):
    c = ecpay.cfg()
    amount = str(int(c["amount"]))
    api = (os.environ.get("API_BASE") or f"https://{event['requestContext']['domainName']}").strip().rstrip("/")
    params = {
        "MerchantID": str(c["merchant_id"]), "MerchantTradeNo": mtn,
        "MerchantTradeDate": datetime.now(TW).strftime("%Y/%m/%d %H:%M:%S"),
        "PaymentType": "aio", "ChoosePayment": "Credit", "EncryptType": "1",
        "TotalAmount": amount, "PeriodAmount": amount,
        "PeriodType": "M", "Frequency": "1", "ExecTimes": "999",
        "ItemName": f"機票降價通知 月訂閱 台北-{CITY.get(route.split('-')[1], route)}",
        "TradeDesc": "Flight Price Notifier monthly plan",
        "ReturnURL": f"{api}/ecpay-return", "PeriodReturnURL": f"{api}/ecpay-period",
        "OrderResultURL": f"{api}/ecpay-result",
        "CustomField1": email, "CustomField2": route,
    }
    params["CheckMacValue"] = ecpay.gen_cmv(params)
    inputs = "".join(f'<input type="hidden" name="{html.escape(k)}" value="{html.escape(v)}">' for k, v in params.items())
    return ('<!doctype html><html><head><meta charset="utf-8"><title>前往綠界付款…</title></head><body>'
            f'<form method="post" action="{ecpay.base_url()}/Cashier/AioCheckOut/V5">{inputs}'
            '<noscript><button type="submit">前往綠界付款 / Continue to ECPay</button></noscript></form>'
            '<p style="font-family:sans-serif;text-align:center;margin-top:40px">正在前往綠界付款頁… / Redirecting to ECPay…</p>'
            '<script>document.forms[0].submit()</script></body></html>')


def handler(event, context):
    try:
        raw = event.get("body") or "{}"
        if event.get("isBase64Encoded"):
            import base64
            raw = base64.b64decode(raw).decode()
        data = json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        return resp(400, {"error": "invalid JSON body"})
    email = str(data.get("email", "")).strip().lower()
    plan_name = str(data.get("plan_name", "")).strip().lower()
    if not EMAIL_RE.match(email):
        return resp(400, {"error": "invalid email"})
    if plan_name not in PLANS:
        return resp(400, {"error": "plan_name must be tokyo, seoul or london"})
    try:
        target = Decimal(str(data.get("target_price")))
    except (InvalidOperation, TypeError):
        return resp(400, {"error": "target_price must be a number"})
    if not target.is_finite() or target <= 0 or target > 1000000:
        return resp(400, {"error": "target_price must be a positive TWD amount"})
    target = target.quantize(Decimal("1"))
    p = PLANS[plan_name]
    route = f"{p['origin']}-{p['destination']}"
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    key = {"email": email, "route": route}
    base = "SET plan_name=:pn, origin=:o, destination=:d, target_price=:t, currency=:c, " \
           "updated_at=:now, created_at=if_not_exists(created_at, :now)"
    vals = {":pn": plan_name, ":o": p["origin"], ":d": p["destination"], ":t": target, ":c": "TWD", ":now": now}

    row = ddb.get_item(Key=key).get("Item")
    if in_service(row):
        # Paid (or cancelled but still paid-through): update the target in place, never back to pending_payment.
        new = ddb.update_item(Key=key, UpdateExpression=base, ExpressionAttributeValues=vals,
                              ReturnValues="ALL_NEW")["Attributes"]
        return resp(200, {"ok": True, "subscription": {
            "email": email, "route": route, "plan_name": plan_name, "target_price": int(target), "currency": "TWD",
            "updated_at": now, "subscription_status": new.get("subscription_status"),
            "current_period_end": new.get("current_period_end"),
            "current_period_end_date": new.get("current_period_end_date")}})

    # New, unpaid, or expired: mark pending_payment with a fresh trade no and hand the browser to ECPay.
    mtn = trade_no()
    ddb.update_item(Key=key, UpdateExpression=base + ", subscription_status=:st, merchant_trade_no=:mtn",
                    ExpressionAttributeValues=dict(vals, **{":st": "pending_payment", ":mtn": mtn}))
    print("checkout", email, route, mtn)
    return {"statusCode": 200, "headers": {"content-type": "text/html; charset=utf-8"},
            "body": checkout_form(event, email, route, mtn)}
