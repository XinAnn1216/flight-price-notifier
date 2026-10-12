// Subscriptions live in DynamoDB behind API Gateway; the browser holds no AWS
// credentials. The base URL is public, so a default is fine for the static build.
const API_BASE = (
  import.meta.env["VITE_FLIGHT_API_URL"] ??
  "https://b4didc2vx8.execute-api.ap-southeast-1.amazonaws.com"
).replace(/\/$/, "");

export type PlanName = "tokyo" | "seoul";

export type Subscription = {
  email: string;
  route: string;
  plan_name: PlanName;
  target_price: number;
  currency: "TWD";
  updated_at?: string;
};

export const PLANS: { name: PlanName; route: string; label: string; hint: number }[] = [
  { name: "tokyo", route: "TPE-TYO", label: "台北 ✈ 東京", hint: 9325 },
  { name: "seoul", route: "TPE-SEL", label: "台北 ✈ 首爾", hint: 5989 },
];

async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body;
}

export async function listSubscriptions(email: string): Promise<Subscription[]> {
  const res = await fetch(`${API_BASE}/subscriptions?email=${encodeURIComponent(email)}`);
  return (await readJson<{ subscriptions: Subscription[] }>(res)).subscriptions;
}

export async function saveSubscription(
  email: string,
  planName: PlanName,
  targetPrice: number,
): Promise<Subscription> {
  const res = await fetch(`${API_BASE}/subscribe`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, plan_name: planName, target_price: targetPrice }),
  });
  return (await readJson<{ subscription: Subscription }>(res)).subscription;
}
