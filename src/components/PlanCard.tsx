import { useEffect, useState, type FormEvent } from "react";
import { BadgeCheck } from "lucide-react";
import { GinkgoLeaf } from "@/components/GinkgoLeaf";
import { saveSubscription, type PlanName, type Subscription } from "@/lib/flight-api";

export function PlanCard({
  email,
  plan,
  subscription,
  loading,
  onSaved,
}: {
  email: string;
  plan: { name: PlanName; label: string; hint: number };
  subscription?: Subscription | undefined;
  loading: boolean;
  onSaved: (s: Subscription) => void;
}) {
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (subscription) setTarget(String(subscription.target_price));
  }, [subscription]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = Number(target);
    if (!Number.isFinite(value) || value <= 0) {
      setError("請輸入大於 0 的目標價 / Enter a positive target price");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onSaved(await saveSubscription(email, plan.name, Math.round(value)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="relative overflow-hidden rounded-2xl border bg-card p-6 shadow-soft"
    >
      <GinkgoLeaf className="pointer-events-none absolute -bottom-12 -right-8 w-28 -rotate-[24deg] opacity-20" />
      <div className="relative flex items-start justify-between gap-3">
        <h2 className="text-2xl font-semibold">{plan.label}</h2>
        {subscription && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
            <BadgeCheck className="h-3.5 w-3.5" /> 已訂閱 / Subscribed
          </span>
        )}
      </div>
      <p className="relative mt-2 text-sm text-muted-foreground">
        {subscription
          ? `目前目標價 NT$${subscription.target_price.toLocaleString()}`
          : `近期最低價約 NT$${plan.hint.toLocaleString()}，設定你的目標價`}
      </p>
      <label className="relative mt-5 block text-sm font-medium" htmlFor={`target-${plan.name}`}>
        目標價 (TWD) / Target price
      </label>
      <div className="relative mt-2 flex gap-2">
        <input
          id={`target-${plan.name}`}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          required
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder={String(plan.hint + 1000)}
          className="w-full min-w-0 rounded-full border bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={saving || loading}
          className="shrink-0 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-soft transition hover:brightness-105 disabled:opacity-60"
        >
          {saving ? "儲存中…" : subscription ? "更新目標價" : "開始追蹤"}
        </button>
      </div>
      {error && <p className="relative mt-3 text-sm text-destructive">{error}</p>}
    </form>
  );
}
