import os
import ecpay


def handler(event, context):
    """OrderResultURL arrives as a browser POST; a static SPA would 405, so bounce it to /app with a 302.
    UX only: activation happens in flight-ecpay-return."""
    site = os.environ.get("SITE_URL", "https://flight-price-notifier-three.vercel.app").strip().rstrip("/")
    p = ecpay.form_body(event) if event.get("body") else {}
    outcome = "failed" if p.get("RtnCode") not in (None, "1") else "success"
    return {"statusCode": 302, "headers": {"Location": f"{site}/app?purchase={outcome}"}, "body": ""}
