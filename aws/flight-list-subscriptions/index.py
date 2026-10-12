import json, boto3
from decimal import Decimal
from boto3.dynamodb.conditions import Key

ddb = boto3.resource("dynamodb").Table("subscriptions")


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
            "body": json.dumps({"subscriptions": rows})}
