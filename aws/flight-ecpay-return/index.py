import boto3
import ecpay

ddb = boto3.resource("dynamodb").Table("subscriptions")


def handler(event, context):
    """ReturnURL: the first-period authorization result. The only writer of pending_payment -> active."""
    p = ecpay.form_body(event)
    mtn = p.get("MerchantTradeNo", "")
    if not ecpay.verify(p):
        print("CMV/merchant mismatch", mtn, "fields:", sorted(p))
        return ecpay.text("0|CheckMacValueInvalid", 400)
    email, route = p.get("CustomField1", ""), p.get("CustomField2", "")
    print("return", mtn, email, route, "RtnCode", p.get("RtnCode"), p.get("RtnMsg"), "SimulatePaid", p.get("SimulatePaid"))
    if p.get("SimulatePaid") == "1":
        return ecpay.text("1|OK")  # verified + acked, but a backoffice simulation never grants access
    if p.get("RtnCode") != "1":
        return ecpay.text("1|OK")  # failed first auth: ECPay won't schedule renewals; row stays pending_payment
    if not email or not route:
        return ecpay.text("0|MissingCustomField", 400)
    row = ddb.get_item(Key={"email": email, "route": route}).get("Item")
    if not row:
        print("no row for", email, route)
        return ecpay.text("1|OK")
    if row.get("subscription_status") == "active" and row.get("merchant_trade_no") == mtn:
        print("already active for", mtn, "- resend ignored")
        return ecpay.text("1|OK")
    now = ecpay.now_ts()
    end = ecpay.add_month(now)
    ddb.update_item(
        Key={"email": email, "route": route},
        UpdateExpression="SET subscription_status=:a, merchant_trade_no=:m, activated_at=:n, current_period_end=:e, "
                         "current_period_end_date=:ed, total_success_times=:one, failed_attempts=:zero, updated_at=:n",
        ExpressionAttributeValues={":a": "active", ":m": mtn, ":n": now, ":e": end, ":ed": end[:10],
                                   ":one": 1, ":zero": 0})
    ecpay.enqueue_status("welcome", email, route, merchant_trade_no=mtn, current_period_end_date=end[:10],
                         amount=p.get("TradeAmt") or p.get("Amount"))
    print("activated", email, route, "until", end)
    return ecpay.text("1|OK")
