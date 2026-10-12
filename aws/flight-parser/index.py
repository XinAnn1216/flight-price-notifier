import os, json, urllib.request, urllib.parse, urllib.error
from datetime import datetime, timezone
from decimal import Decimal
import boto3
from boto3.dynamodb.conditions import Attr

UA = "Mozilla/5.0 (compatible; flight-notifier/1.0)"
_sm = boto3.client("secretsmanager")
_sqs = boto3.client("sqs")
_ddb = boto3.resource("dynamodb").Table("subscriptions")
_token = None
_qurl = None


def token():
    global _token
    if _token is None:
        _token = json.loads(_sm.get_secret_value(SecretId="flight/travelpayouts")["SecretString"])["token"]
    return _token


def qurl():
    global _qurl
    if _qurl is None:
        _qurl = _sqs.get_queue_url(QueueName=os.environ.get("FARE_QUEUE", "flight-fare-queue"))["QueueUrl"]
    return _qurl


def upcoming_months(n=3):
    now = datetime.now(timezone.utc)
    y, m = now.year, now.month
    out = []
    for _ in range(n):
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
        out.append(f"{y:04d}-{m:02d}")
    return out


def fetch_cheapest(origin, destination, month, tok, currency):
    q = urllib.parse.urlencode({"origin": origin, "destination": destination, "depart_date": month,
                                "currency": currency, "token": tok})
    req = urllib.request.Request(f"https://api.travelpayouts.com/v1/prices/cheap?{q}",
                                 headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            body = json.loads(r.read())
    except urllib.error.HTTPError as e:
        print("travelpayouts", currency, "HTTP", e.code)
        return None
    except Exception as e:
        print("travelpayouts", currency, "error", repr(e))
        return None
    if not body.get("success") or not body.get("data"):
        print("travelpayouts", currency, month, "empty:", str(body)[:200])
        return None
    offers = body["data"].get(destination, {})
    if not offers:
        print("travelpayouts", currency, month, "no offers for", destination, "keys:", list(body["data"])[:5])
        return None
    best = min(offers.values(), key=lambda o: o["price"])
    return {"price": best["price"], "currency": currency.upper(), "airline": best.get("airline"),
            "depart_date": best.get("departure_at"), "return_date": best.get("return_at")}


def subscribers(route):
    kw = {"FilterExpression": Attr("route").eq(route)}
    while True:
        page = _ddb.scan(**kw)
        yield from page.get("Items", [])
        if "LastEvaluatedKey" not in page:
            return
        kw["ExclusiveStartKey"] = page["LastEvaluatedKey"]


def handler(event, context):
    origin, destination = event["origin"], event["destination"]
    route = event.get("route") or f"{origin}-{destination}"
    tok = token()
    # Short-haul routes usually have next-month fares cached; long-haul ones (e.g. London)
    # may only have later months, so fall back up to three months ahead.
    tw, month = None, None
    for month in upcoming_months():
        tw = fetch_cheapest(origin, destination, month, tok, "twd")
        if tw:
            break
    if not tw:
        print("no TWD fare for", route, month, "(empty/429) - skipping")
        return {"ok": True, "route": route, "matched": 0}
    us = fetch_cheapest(origin, destination, month, tok, "usd")  # best-effort; never blocks
    print(route, month, "cheapest", tw["price"], "TWD", tw["airline"], tw["depart_date"],
          "| USD", us["price"] if us else "n/a")
    matched = 0
    for it in subscribers(route):  # M1: no subscription_status filter
        tp = it.get("target_price")
        if tp is None or Decimal(tp) < Decimal(str(tw["price"])):
            continue
        body = {"email": it["email"], "route": route, "plan_name": it.get("plan_name"),
                "target_price": int(tp), "cheapest": dict(tw, currency="TWD")}
        if us:
            body["cheapest_usd"] = dict(us, currency="USD")
        _sqs.send_message(QueueUrl=qurl(), MessageBody=json.dumps(body))
        matched += 1
    print(route, "matched", matched, "subscriber(s)")
    return {"ok": True, "route": route, "matched": matched, "cheapest_twd": tw["price"]}
