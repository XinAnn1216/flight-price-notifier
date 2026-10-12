import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
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
  const [subs, setSubs] = useState<Record<string, Subscription>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listSubscriptions(email)
      .then((rows) => !cancelled && setSubs(Object.fromEntries(rows.map((r) => [r.plan_name, r]))))
      .catch((err) => !cancelled && setLoadError(err instanceof Error ? err.message : String(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [email]);

  async function signOut() {
    await supabase.auth.signOut();
    navigate("/", { replace: true });
  }
  return (
    <div className="min-h-screen">
      <header className="border-b bg-background/75 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Logo />
          <button onClick={signOut} className="rounded-full border bg-card px-4 py-2 text-sm shadow-soft transition hover:bg-secondary">
            Sign out / 登出
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-20">
        <h1 className="text-4xl font-semibold tracking-tight">Hi {user.email}</h1>
        <p className="mt-3 text-muted-foreground">
          選一條航線、設定目標價，票價達標時我們會寄 email 通知你。
          <br />
          Pick a route and a target price; we email you when the fare drops to it.
        </p>
        {loadError && (
          <p className="mt-6 rounded-xl border border-destructive/40 bg-card p-4 text-sm text-destructive">
            無法載入你的訂閱 / Could not load your subscriptions: {loadError}
          </p>
        )}
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {PLANS.map((plan) => (
            <PlanCard
              key={plan.name}
              email={email}
              plan={plan}
              subscription={subs[plan.name]}
              loading={loading}
              onSaved={(s) => setSubs((prev) => ({ ...prev, [s.plan_name]: s }))}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
