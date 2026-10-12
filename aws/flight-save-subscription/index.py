import json, re, boto3
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

PLANS = {"tokyo": {"origin": "TPE", "destination": "TYO"}, "seoul": {"origin": "TPE", "destination": "SEL"}}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
ddb = boto3.resource("dynamodb").Table("subscriptions")


def resp(code, body):
    return {"statusCode": code, "headers": {"content-type": "application/json"}, "body": json.dumps(body)}


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
        return resp(400, {"error": "plan_name must be tokyo or seoul"})
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
    # Upsert; keep the original created_at. No subscription_status in M1.
    ddb.update_item(
        Key={"email": email, "route": route},
        UpdateExpression="SET plan_name=:pn, origin=:o, destination=:d, target_price=:t, currency=:c, "
        "updated_at=:now, created_at=if_not_exists(created_at, :now)",
        ExpressionAttributeValues={":pn": plan_name, ":o": p["origin"], ":d": p["destination"],
                                   ":t": target, ":c": "TWD", ":now": now},
    )
    return resp(200, {"ok": True, "subscription": {"email": email, "route": route, "plan_name": plan_name,
                                                   "target_price": int(target), "currency": "TWD", "updated_at": now}})
