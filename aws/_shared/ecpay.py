"""Shared ECPay helpers, bundled next to index.py in every M2 Lambda zip (stdlib + boto3 only)."""
import base64, calendar, hashlib, json, os, urllib.parse
from datetime import datetime, timezone
import boto3

CASHIER = {"stage": "https://payment-stage.ecpay.com.tw", "prod": "https://payment.ecpay.com.tw"}
TS_FMT = "%Y-%m-%dT%H:%M:%SZ"  # fixed-width UTC; current_period_end is compared as a string

_sm = boto3.client("secretsmanager")
_sqs = boto3.client("sqs")
_cfg = None
_status_qurl = None


def cfg():
    global _cfg
    if _cfg is None:
        _cfg = json.loads(_sm.get_secret_value(SecretId="flight/ecpay")["SecretString"])
    return _cfg


def base_url():
    return CASHIER["prod" if cfg().get("env") == "prod" else "stage"]


def ecpay_url_encode(s):
    e = urllib.parse.quote_plus(str(s)).replace("~", "%7E").lower()
    for o, n in (("%2d", "-"), ("%5f", "_"), ("%2e", "."), ("%21", "!"), ("%2a", "*"), ("%28", "("), ("%29", ")")):
        e = e.replace(o, n)
    return e


def gen_cmv(params, hash_key=None, hash_iv=None):
    c = cfg() if hash_key is None else {"hash_key": hash_key, "hash_iv": hash_iv}
    items = {k: v for k, v in params.items() if k != "CheckMacValue"}  # keep "" values
    body = "&".join(f"{k}={items[k]}" for k in sorted(items, key=str.lower))
    raw = f"HashKey={c['hash_key']}&{body}&HashIV={c['hash_iv']}"
    return hashlib.sha256(ecpay_url_encode(raw).encode()).hexdigest().upper()


def verify(params):
    """CMV matches and the callback is for our merchant."""
    return (params.get("CheckMacValue", "").upper() == gen_cmv(params)
            and params.get("MerchantID") == str(cfg()["merchant_id"]))


def form_body(event):
    raw = event.get("body") or ""
    raw = base64.b64decode(raw).decode() if event.get("isBase64Encoded") else raw
    return {k: v[0] for k, v in urllib.parse.parse_qs(raw, keep_blank_values=True).items()}


def text(body, status=200):
    return {"statusCode": status, "headers": {"Content-Type": "text/plain; charset=utf-8"}, "body": body}


def now_ts():
    return datetime.now(timezone.utc).strftime(TS_FMT)


def add_month(ts):
    """One calendar month later (clamped to month end), same fixed-width format."""
    d = datetime.strptime(ts, TS_FMT)
    y, m = (d.year + 1, 1) if d.month == 12 else (d.year, d.month + 1)
    return d.replace(year=y, month=m, day=min(d.day, calendar.monthrange(y, m)[1])).strftime(TS_FMT)


def enqueue_status(event_type, email, route, **extra):
    global _status_qurl
    if _status_qurl is None:
        _status_qurl = _sqs.get_queue_url(QueueName=os.environ.get("STATUS_QUEUE", "flight-status-queue"))["QueueUrl"]
    _sqs.send_message(QueueUrl=_status_qurl,
                      MessageBody=json.dumps(dict(extra, event_type=event_type, email=email, route=route)))
