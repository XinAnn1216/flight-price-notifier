import os, json, html, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta
from decimal import Decimal
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


def env_num(name, default):
    return Decimal(os.environ.get(name, str(default)))


# ---------- renderer (folded inline) ----------
def _ddmm(iso):
    return f"{iso[8:10]}{iso[5:7]}" if iso and len(iso) >= 10 else ""


def _date(iso):
    return iso[:10] if iso else "?"


def route_label(fare):
    o, d = fare["route"].split("-")
    return f"{CITY.get(o, o)} → {CITY.get(d, d)}", o, d


def booking_url(fare, marker=None):
    _, o, d = route_label(fare)
    c = fare["cheapest"]
    path = f"{o}{_ddmm(c.get('depart_date'))}{d}{_ddmm(c.get('return_date'))}1"
    url = f"https://www.aviasales.com/search/{path}"
    return f"{url}?marker={marker}" if marker else url


def subject(fare):
    label, _, _ = route_label(fare)
    return f"✈️ {label} 降價通知！NT${int(fare['cheapest']['price']):,} 已達標"


def render_text(fare, target_price, marker=None, usd_price=None):
    label, _, _ = route_label(fare)
    c = fare["cheapest"]
    lines = [f"{label} 最低價 NT${int(c['price']):,}，已低於你的目標價 NT${int(target_price):,}。"]
    if usd_price is not None:
        lines.append(f"約 US${int(usd_price):,}")
    lines += [f"航空公司：{c.get('airline') or '-'}",
              f"去程：{_date(c.get('depart_date'))}　回程：{_date(c.get('return_date'))}",
              f"立即訂購：{booking_url(fare, marker)}", "",
              "— Flight Price Notifier 機票降價通知"]
    return "\n".join(lines)


def render_html(fare, target_price, marker=None, usd_price=None):
    label, _, _ = route_label(fare)
    c = fare["cheapest"]
    e = html.escape
    usd = (f'<p style="margin:4px 0 0;color:#8a6d3b;font-size:14px">約 US${int(usd_price):,}</p>'
           if usd_price is not None else "")
    return (
        '<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;'
        'padding:24px;color:#3b2f1e;background:#fffaf0;border-radius:12px">'
        f'<p style="margin:0;font-size:14px;color:#8a6d3b">{e(label)} 降價通知</p>'
        f'<h1 style="margin:8px 0 0;font-size:32px;color:#b8860b">NT${int(c["price"]):,}</h1>'
        f'{usd}'
        f'<p style="margin:16px 0 0">已低於你的目標價 <b>NT${int(target_price):,}</b>。</p>'
        f'<p style="margin:8px 0 0;font-size:14px">航空公司：{e(str(c.get("airline") or "-"))}<br>'
        f'去程：{e(_date(c.get("depart_date")))}　回程：{e(_date(c.get("return_date")))}</p>'
        f'<p style="margin:24px 0"><a href="{e(booking_url(fare, marker))}" style="background:#b8860b;'
        'color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:600">立即訂購</a></p>'
        '<p style="margin:0;font-size:12px;color:#8a6d3b">Flight Price Notifier 機票降價通知</p></div>'
    )


# ---------- dedup ----------
def should_send(pk, new_price):
    last = _hist.query(KeyConditionExpression=Key("pk").eq(pk), ScanIndexForward=False, Limit=1).get("Items")
    if not last:
        return True, "no history"
    last = last[0]
    sent = datetime.fromisoformat(last["sent_at"])
    if datetime.now(timezone.utc) - sent > timedelta(hours=float(env_num("NOTIFY_FLOOR_HOURS", 24))):
        return True, "outside floor"
    lp = Decimal(last["price"])
    if new_price <= lp * (1 - env_num("REALERT_PCT", 20) / 100):
        return True, f"pct drop vs {lp}"
    if lp - new_price >= env_num("REALERT_ABS_TWD", 2000):
        return True, f"abs drop vs {lp}"
    return False, f"last {lp} at {last['sent_at']}"


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


def process(fare):
    email, route = fare["email"], fare["route"]
    new_price = Decimal(str(fare["cheapest"]["price"]))
    pk = f"{email}#{route}"
    ok, why = should_send(pk, new_price)
    if not ok:
        print(pk, "skipped (deduped):", why)
        return
    usd = fare.get("cheapest_usd", {}).get("price") if fare.get("cheapest_usd") else None
    marker = None  # optional affiliate marker (skipped in M1)
    status, body = send_email(email, subject(fare), render_html(fare, fare["target_price"], marker, usd),
                              render_text(fare, fare["target_price"], marker, usd))
    if 200 <= status < 300:
        _hist.put_item(Item={"pk": pk, "sent_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                             "email": email, "route": route, "price": new_price, "currency": "TWD"})
        print(pk, "sent", why, "resend id", body.get("id") if isinstance(body, dict) else body)
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
