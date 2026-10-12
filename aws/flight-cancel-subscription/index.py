import json, time, urllib.parse, urllib.request
import boto3
import ecpay

ddb = boto3.resource("dynamodb").Table("subscriptions")


def resp(code, body):
    return {"statusCode": code, "headers": {"content-type": "application/json"}, "body": json.dumps(body)}


def ecpay_cancel(mtn):
    c = ecpay.cfg()
    params = {"MerchantID": str(c["merchant_id"]), "MerchantTradeNo": mtn, "Action": "Cancel",
              "TimeStamp": str(int(time.time()))}
    params["CheckMacValue"] = ecpay.gen_cmv(params)
    req = urllib.request.Request(f"{ecpay.base_url()}/Cashier/CreditCardPeriodAction",
                                 data=urllib.parse.urlencode(params).encode(), method="POST",
                                 headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=15) as r:
        out = {k: v[0] for k, v in urllib.parse.parse_qs(r.read().decode(), keep_blank_values=True).items()}
    return out.get("RtnCode"), out.get("RtnMsg")


def handler(event, context):
    # NOTE: like M1's /subscribe, trusts the client-supplied email (course scope); production would verify the Supabase JWT.
    try:
        data = json.loads(event.get("body") or "{}")
    except Exception:
        return resp(400, {"error": "invalid JSON body"})
    email = str(data.get("email", "")).strip().lower()
    route = str(data.get("route", "")).strip().upper()
    key = {"email": email, "route": route}
    row = ddb.get_item(Key=key).get("Item") if email and route else None
    if not row:
        return resp(404, {"error": "subscription not found"})
    status = row.get("subscription_status")
    if status == "cancelled":
        return resp(200, {"ok": True, "subscription_status": "cancelled",
                          "current_period_end_date": row.get("current_period_end_date")})
    if status != "active":
        return resp(409, {"error": f"subscription is {status or 'unpaid'}, nothing to cancel"})
    mtn = row.get("merchant_trade_no")
    try:
        code, msg = ecpay_cancel(mtn)
        # A never-scheduled (e.g. synthetic) order returns 90100150 不存在的訂單編號; still cancel locally.
        print("ECPay cancel", mtn, code, msg)
    except Exception as e:
        print("ECPay cancel call failed", mtn, repr(e), "- cancelling locally")
    now = ecpay.now_ts()
    end = row.get("current_period_end") or ecpay.add_month(now)  # migration fallback: keep a grace month
    ddb.update_item(Key=key,
                    UpdateExpression="SET subscription_status=:c, cancelled_at=:n, current_period_end=:e, "
                                     "current_period_end_date=:ed, updated_at=:n",
                    ExpressionAttributeValues={":c": "cancelled", ":n": now, ":e": end, ":ed": end[:10]})
    ecpay.enqueue_status("cancel", email, route, merchant_trade_no=mtn, current_period_end_date=end[:10])
    return resp(200, {"ok": True, "subscription_status": "cancelled", "current_period_end": end,
                      "current_period_end_date": end[:10]})
