// Subscriptions live in DynamoDB behind API Gateway; the browser holds no AWS
// credentials. The base URL is public, so a default is fine for the static build.
const API_BASE = (
  import.meta.env["VITE_FLIGHT_API_URL"] ??
  "https://b4didc2vx8.execute-api.ap-southeast-1.amazonaws.com"
).replace(/\/$/, "");

export type PlanName = "tokyo" | "seoul" | "london";

// M2 lifecycle: pending_payment -> active -> cancelled (still served until current_period_end) -> expired.
// Rows saved before M2 have no status and are treated as unpaid.
export type SubscriptionStatus = "pending_payment" | "active" | "cancelled" | "expired";

export type Subscription = {
  email: string;
  route: string;
  plan_name: PlanName;
  target_price: number;
  currency: "TWD";
  updated_at?: string;
  subscription_status?: SubscriptionStatus;
  current_period_end?: string;
  current_period_end_date?: string;
};

export function statusOf(s: Subscription | undefined): SubscriptionStatus | "none" {
  if (!s) return "none";
  return s.subscription_status ?? "pending_payment";
}

// hint is a recent cheapest fare (TWD); null when the fare source has no data for the route yet.
export const PLANS: { name: PlanName; route: string; label: string; hint: number | null }[] = [
  { name: "tokyo", route: "TPE-TYO", label: "台北 ✈ 東京", hint: 9325 },
  { name: "seoul", route: "TPE-SEL", label: "台北 ✈ 首爾", hint: 5989 },
  { name: "london", route: "TPE-LON", label: "台北 ✈ 倫敦", hint: null },
];

async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

export async function listSubscriptions(
  email: string,
): Promise<{ subscriptions: Subscription[]; monthlyPrice: number | null }> {
  const res = await fetch(`${API_BASE}/subscriptions?email=${encodeURIComponent(email)}`);
  const body = await readJson<{ subscriptions: Subscription[]; monthly_price?: number }>(res);
  return { subscriptions: body.subscriptions, monthlyPrice: body.monthly_price ?? null };
}

// /subscribe answers with ECPay's auto-submit checkout page (text/html) for anyone who still has to pay,
// or with JSON when a paid-through subscription only changed its target price.
export type SaveResult =
  { kind: "checkout"; html: string } | { kind: "updated"; subscription: Subscription };

export async function saveSubscription(
  email: string,
  planName: PlanName,
  targetPrice: number,
): Promise<SaveResult> {
  const res = await fetch(`${API_BASE}/subscribe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, plan_name: planName, target_price: targetPrice }),
  });
  if (res.ok && (res.headers.get("content-type") ?? "").includes("text/html")) {
    return { kind: "checkout", html: await res.text() };
  }
  return {
    kind: "updated",
    subscription: (await readJson<{ subscription: Subscription }>(res)).subscription,
  };
}

// Replace the page with the returned form; its inline script POSTs the browser to ECPay's cashier.
export function goToCheckout(html: string) {
  document.open();
  document.write(html);
  document.close();
}

export async function cancelSubscription(
  email: string,
  route: string,
): Promise<{ subscription_status: SubscriptionStatus; current_period_end_date?: string }> {
  const res = await fetch(`${API_BASE}/cancel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, route }),
  });
  return readJson(res);
}
