import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { usePageMeta } from "@/lib/page-meta";
import { PlanCard } from "@/components/PlanCard";
import { listSubscriptions, PLANS, type Subscription } from "@/lib/flight-api";
import { useAuthenticatedUser } from "./authenticated";

export function AppPage() {
  usePageMeta({
    title: "Dashboard — Flight Price Notifier",
    description: "Your flight route tracking dashboard.",
  });
  const user = useAuthenticatedUser();
  const navigate = useNavigate();
  const email = (user.email ?? "").toLowerCase();
  const [searchParams] = useSearchParams();
  const purchase = searchParams.get("purchase"); // set by the ECPay OrderResultURL redirect
  const [subs, setSubs] = useState<Record<string, Subscription>>({});
  const [monthlyPrice, setMonthlyPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      listSubscriptions(email)
        .then(({ subscriptions, monthlyPrice }) => {
          if (cancelled) return;
          setSubs(Object.fromEntries(subscriptions.map((r) => [r.plan_name, r])));
          setMonthlyPrice(monthlyPrice);
        })
        .catch(
          (err) => !cancelled && setLoadError(err instanceof Error ? err.message : String(err)),
        )
        .finally(() => !cancelled && setLoading(false));
    load();
    // Right after paying, ECPay's server callback may land a moment after the browser does.
    const retry = purchase === "success" ? setTimeout(load, 4000) : undefined;
    return () => {
      cancelled = true;
      clearTimeout(retry);
    };
  }, [email, purchase]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate("/", { replace: true });
  }
  return (
    <div className="min-h-screen">
      <header className="border-b bg-background/75 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Logo />
          <button
            onClick={signOut}
            className="rounded-full border bg-card px-4 py-2 text-sm shadow-soft transition hover:bg-secondary"
          >
            Sign out / 登出
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-20">
        <h1 className="text-4xl font-semibold tracking-tight">Hi {user.email}</h1>
        <p className="mt-3 text-muted-foreground">
          選一條航線、設定目標價，票價達標時我們會寄 email 通知你。
          <br />
          Pick a route and a target price; we email you when the fare drops to it.
        </p>
        {purchase === "success" && (
          <p className="mt-6 rounded-xl border border-primary/50 bg-card p-4 text-sm shadow-soft">
            付款完成，謝謝訂閱！確認信會寄到你的 email，降價時就會通知你。
            <br />
            Payment received. Your alerts are on.
          </p>
        )}
        {purchase === "failed" && (
          <p className="mt-6 rounded-xl border border-destructive/40 bg-card p-4 text-sm text-destructive">
            付款沒有完成，可以再按一次「完成付款」重試。 / Payment did not go through, please try
            again.
          </p>
        )}
        {loadError && (
          <p className="mt-6 rounded-xl border border-destructive/40 bg-card p-4 text-sm text-destructive">
            無法載入你的訂閱 / Could not load your subscriptions: {loadError}
          </p>
        )}
        <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.name}
              email={email}
              plan={plan}
              subscription={subs[plan.name]}
              monthlyPrice={monthlyPrice}
              loading={loading}
              onSaved={(s) => setSubs((prev) => ({ ...prev, [s.plan_name]: s }))}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
