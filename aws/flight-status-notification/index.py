import json, html, urllib.request, urllib.error
from datetime import datetime, timezone
import boto3
from boto3.dynamodb.conditions import Key

UA = "Mozilla/5.0 (compatible; flight-notifier/1.0)"
CITY = {"TPE": "台北", "TYO": "東京", "SEL": "首爾", "LON": "倫敦"}
_sm = boto3.client("secretsmanager")
_hist = boto3.resource("dynamodb").Table("notification_history")
_resend = None


class Transient(Exception):
    pass


def resend_cfg():
    global _resend
    if _resend is None:
        _resend = json.loads(_sm.get_secret_value(SecretId="flight/resend")["SecretString"])
    return _resend


def label(route):
    o, d = route.split("-")
    return f"{CITY.get(o, o)} → {CITY.get(d, d)}"


def render(msg):
    """One consumer for every status email, routed by event_type."""
    lbl, until = label(msg["route"]), msg.get("current_period_end_date") or "-"
    if msg["event_type"] == "welcome":
        subj = f"🍂 訂閱成功：{lbl} 機票降價通知"
        lines = [f"感謝訂閱！你的 {lbl} 降價通知已啟用。",
                 f"本期有效至 {until}，之後每月自動續訂。",
                 "票價低於你的目標價時，我們會寄 email 通知你。"]
    elif msg["event_type"] == "cancel":
        subj = f"已取消訂閱：{lbl} 機票降價通知"
        lines = ["我們已停止你的自動續訂，之後不會再扣款。",
                 f"已付費的期間內仍會收到通知，直到 {until}。",
                 "想回來時，到網站上重新訂閱就可以了。"]
    else:
        raise ValueError(f"unknown event_type {msg['event_type']!r}")
    text = "\n".join(lines + ["", "— Flight Price Notifier 機票降價通知"])
    body = "".join(f'<p style="margin:12px 0 0">{html.escape(l)}</p>' for l in lines)
    html_body = ('<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;'
                 'padding:24px;color:#3b2f1e;background:#fffaf0;border-radius:12px">'
                 f'<h1 style="margin:0;font-size:22px;color:#b8860b">{html.escape(subj)}</h1>{body}'
                 '<p style="margin:24px 0 0;font-size:12px;color:#8a6d3b">Flight Price Notifier 機票降價通知</p></div>')
    return subj, html_body, text


def send_email(to, subj, html_body, text_body):
    cfg = resend_cfg()
    data = json.dumps({"from": cfg["from"], "to": [to], "subject": subj, "html": html_body,
                       "text": text_body}).encode()
    req = urllib.request.Request("https://api.resend.com/emails", data=data, method="POST", headers={
        "Authorization": f"Bearer {cfg['api_key']}", "Content-Type": "application/json", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, (e.read() or b"")[:300].decode(errors="replace")
    except Exception as e:
        raise Transient(repr(e))


def process(msg):
    # Once per (subscription, event, order): callback resends / SQS redelivery must not email twice.
    pk = f"{msg['email']}#{msg['route']}#{msg['event_type']}#{msg.get('merchant_trade_no', '')}"
    if _hist.query(KeyConditionExpression=Key("pk").eq(pk), Limit=1).get("Items"):
        print(pk, "already sent")
        return
    subj, html_body, text_body = render(msg)
    status, body = send_email(msg["email"], subj, html_body, text_body)
    if 200 <= status < 300:
        _hist.put_item(Item={"pk": pk, "sent_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                             "email": msg["email"], "route": msg["route"], "event_type": msg["event_type"]})
        print(pk, "sent", body.get("id") if isinstance(body, dict) else body)
    elif status == 429 or status >= 500:
        raise Transient(f"resend {status}: {body}")
    else:
        print(pk, "dropped permanent failure", status, body)


def handler(event, context):
    failures = []
    for rec in event.get("Records", []):
        try:
            process(json.loads(rec["body"]))
        except Transient as e:
            print("transient, will retry:", e)
            failures.append({"itemIdentifier": rec["messageId"]})
        except Exception as e:
            print("dropping malformed/unexpected message:", repr(e))
    return {"batchItemFailures": failures}
