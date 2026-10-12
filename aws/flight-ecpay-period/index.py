import boto3
import ecpay

ddb = boto3.resource("dynamodb").Table("subscriptions")
MAX_FAILURES = 6  # ECPay terminates the contract after 6 consecutive failed renewals


def handler(event, context):
    """PeriodReturnURL: every renewal from the 2nd charge on."""
    p = ecpay.form_body(event)
    mtn = p.get("MerchantTradeNo", "")
    if not ecpay.verify(p):
        print("CMV/merchant mismatch", mtn, "fields:", sorted(p))
        return ecpay.text("0|CheckMacValueInvalid", 400)
    email, route = p.get("CustomField1", ""), p.get("CustomField2", "")
    print("period", mtn, email, route, "RtnCode", p.get("RtnCode"), p.get("RtnMsg"),
          "TotalSuccessTimes", p.get("TotalSuccessTimes"), "SimulatePaid", p.get("SimulatePaid"))
    if p.get("SimulatePaid") == "1":
        return ecpay.text("1|OK")
    key = {"email": email, "route": route}
    row = ddb.get_item(Key=key).get("Item") if email and route else None
    if not row or row.get("merchant_trade_no") != mtn:
        print("no row for this trade no - ignoring")
        return ecpay.text("1|OK")
    now = ecpay.now_ts()
    if p.get("RtnCode") == "1":
        times = int(p.get("TotalSuccessTimes") or 0)
        if times and times <= int(row.get("total_success_times") or 0):
            print("renewal", times, "already recorded")
            return ecpay.text("1|OK")
        # Extend from the later of the stored paid-through date and now.
        start = max(row.get("current_period_end") or now, now)
        end = ecpay.add_month(start)
        status = "cancelled" if row.get("subscription_status") == "cancelled" else "active"
        ddb.update_item(
            Key=key,
            UpdateExpression="SET subscription_status=:s, current_period_end=:e, current_period_end_date=:ed, "
                             "total_success_times=:t, failed_attempts=:zero, last_charged_at=:n, updated_at=:n",
            ExpressionAttributeValues={":s": status, ":e": end, ":ed": end[:10], ":t": times, ":zero": 0, ":n": now})
        print("renewed", email, route, "until", end)
        return ecpay.text("1|OK")
    # Failed renewal: ECPay retries on its own; only treat the series as over after the 6th strike.
    fails = int(row.get("failed_attempts") or 0) + 1
    expr, vals = "SET failed_attempts=:f, updated_at=:n", {":f": fails, ":n": now}
    if fails >= MAX_FAILURES:
        expr += ", subscription_status=:x"
        vals[":x"] = "expired"
    ddb.update_item(Key=key, UpdateExpression=expr, ExpressionAttributeValues=vals)
    print("renewal failed", fails, "time(s)", "-> expired" if fails >= MAX_FAILURES else "")
    return ecpay.text("1|OK")
