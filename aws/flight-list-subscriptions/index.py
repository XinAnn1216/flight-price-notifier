import json, boto3
from decimal import Decimal
from boto3.dynamodb.conditions import Key

ddb = boto3.resource("dynamodb").Table("subscriptions")
_sm = boto3.client("secretsmanager")
_price = None


def monthly_price():
    # The price lives only in the flight/ecpay secret; the UI shows whatever is configured there.
    global _price
    if _price is None:
        _price = int(json.loads(_sm.get_secret_value(SecretId="flight/ecpay")["SecretString"])["amount"])
    return _price


def plain(v):
    if isinstance(v, Decimal):
        return int(v) if v == v.to_integral_value() else float(v)
    return v


def handler(event, context):
    # NOTE: trusts a client-supplied email with no auth (course M1); production would verify the Supabase JWT.
    email = ((event.get("queryStringParameters") or {}).get("email") or "").strip().lower()
    if not email or "@" not in email:
        return {"statusCode": 400, "headers": {"content-type": "application/json"},
                "body": json.dumps({"error": "email query parameter required"})}
    items = ddb.query(KeyConditionExpression=Key("email").eq(email)).get("Items", [])
    rows = [{k: plain(v) for k, v in it.items()} for it in items]
    return {"statusCode": 200, "headers": {"content-type": "application/json"},
            "body": json.dumps({"subscriptions": rows,
                                        "monthly_price": monthly_price(), "currency": "TWD"})}
