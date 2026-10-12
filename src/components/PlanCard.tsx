import { useEffect, useState, type FormEvent } from "react";
import { BadgeCheck, CircleAlert, Clock, CircleSlash } from "lucide-react";
import { GinkgoLeaf } from "@/components/GinkgoLeaf";
import {
  cancelSubscription,
  goToCheckout,
  saveSubscription,
  statusOf,
  type PlanName,
  type Subscription,
} from "@/lib/flight-api";

const BADGES = {
  active: {
    icon: BadgeCheck,
    text: "已訂閱 (有效) / Active",
    className: "bg-accent text-accent-foreground",
  },
  pending_payment: {
    icon: CircleAlert,
    text: "未完成付款 / Unpaid",
    className: "border border-primary/60 bg-background text-foreground",
  },
  cancelled: {
    icon: Clock,
    text: "已取消 / Cancelled",
    className: "bg-secondary text-secondary-foreground",
  },
  expired: {
    icon: CircleSlash,
    text: "已結束 / Ended",
    className: "bg-muted text-muted-foreground",
  },
} as const;

export function PlanCard({
  email,
  plan,
  subscription,
  monthlyPrice,
  loading,
  onSaved,
}: {
  email: string;
  plan: { name: PlanName; route: string; label: string; hint: number | null };
  subscription?: Subscription | undefined;
  monthlyPrice: number | null;
  loading: boolean;
  onSaved: (s: Subscription) => void;
}) {
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState<"save" | "cancel" | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = statusOf(subscription);
  const paidThrough = status === "active" || status === "cancelled";
  const price = monthlyPrice === null ? "" : `NT$${monthlyPrice.toLocaleString()}/月`;

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
    setBusy("save");
    setError(null);
    try {
      const result = await saveSubscription(email, plan.name, Math.round(value));
      if (result.kind === "checkout") {
        goToCheckout(result.html); // leaves the page for ECPay's cashier
        return;
      }
      onSaved(result.subscription);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setBusy(null);
  }

  async function cancel() {
    if (!subscription) return;
    setBusy("cancel");
    setError(null);
    try {
      const r = await cancelSubscription(email, plan.route);
      onSaved({ ...subscription, ...r });
      setConfirmCancel(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const badge = status === "none" ? null : BADGES[status];
  const until = subscription?.current_period_end_date;
  const description = (() => {
    switch (status) {
      case "active":
        return `目前目標價 NT$${subscription!.target_price.toLocaleString()}${until ? `，下次續訂 ${until}` : ""}`;
      case "cancelled":
        return `有效至 ${until ?? "-"}（仍會通知到該日），目標價 NT$${subscription!.target_price.toLocaleString()}`;
      case "pending_payment":
        return `完成付款後才會開始寄降價通知。目標價 NT$${subscription!.target_price.toLocaleString()}`;
      case "expired":
        return "訂閱已結束，重新訂閱即可繼續收到通知";
      default:
        return plan.hint === null
          ? "目前還沒有這條航線的即時票價，先設定目標價，有資料時會通知你"
          : `近期最低價約 NT$${plan.hint.toLocaleString()}，設定你的目標價`;
    }
  })();
  const submitLabel =
    busy === "save"
      ? paidThrough
        ? "儲存中…"
        : "前往付款…"
      : paidThrough
        ? "更新目標價"
        : status === "pending_payment"
          ? "完成付款 / Pay"
          : status === "expired"
            ? "重新訂閱"
            : "訂閱並付款";

  return (
    <form
      onSubmit={submit}
      className="relative overflow-hidden rounded-2xl border bg-card p-6 shadow-soft"
    >
      <GinkgoLeaf className="pointer-events-none absolute -bottom-12 -right-8 w-28 -rotate-[24deg] opacity-20" />
      <div className="relative flex items-start justify-between gap-3">
        <h2 className="text-2xl font-semibold">{plan.label}</h2>
        {badge && (
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${badge.className}`}
          >
            <badge.icon className="h-3.5 w-3.5" /> {badge.text}
          </span>
        )}
      </div>
      <p className="relative mt-2 text-sm text-muted-foreground">{description}</p>
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
          placeholder={plan.hint === null ? "" : String(plan.hint + 1000)}
          className="w-full min-w-0 rounded-full border bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          disabled={busy !== null || loading}
          className="shrink-0 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-soft transition hover:brightness-105 disabled:opacity-60"
        >
          {submitLabel}
        </button>
      </div>
      {!paidThrough && price && (
        <p className="relative mt-3 text-xs text-muted-foreground">
          月費 {price}，透過綠界 ECPay 信用卡定期定額，可隨時取消。
        </p>
      )}
      {status === "active" && (
        <div className="relative mt-4 text-sm">
          {confirmCancel ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">
                取消後不再續訂，{until ?? "本期"}前仍會通知。確定？
              </span>
              <button
                type="button"
                onClick={cancel}
                disabled={busy !== null}
                className="rounded-full border px-3 py-1 text-destructive transition hover:bg-secondary disabled:opacity-60"
              >
                {busy === "cancel" ? "取消中…" : "確定取消"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmCancel(false)}
                className="rounded-full px-3 py-1 text-muted-foreground transition hover:bg-secondary"
              >
                保留
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              className="text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline"
            >
              取消訂閱 / Cancel subscription
            </button>
          )}
        </div>
      )}
      {error && <p className="relative mt-3 text-sm text-destructive">{error}</p>}
    </form>
  );
}
