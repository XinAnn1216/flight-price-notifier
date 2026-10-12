import { useNavigate } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { usePageMeta } from "@/lib/page-meta";
import { useAuthenticatedUser } from "./authenticated";

export function AppPage() {
  usePageMeta({
    title: "Dashboard — Flight Price Notifier",
    description: "Your flight route tracking dashboard.",
  });
  const user = useAuthenticatedUser();
  const navigate = useNavigate();
  async function signOut() {
    await supabase.auth.signOut();
    navigate("/", { replace: true });
  }
  return (
    <div className="min-h-screen">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Logo />
          <button onClick={signOut} className="rounded-lg border px-4 py-2 text-sm transition hover:bg-secondary">
            Sign out / 登出
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-20">
        <h1 className="text-3xl font-semibold tracking-tight">Hi {user.email}</h1>
        <div className="mt-8 rounded-2xl border bg-card p-8">
          <p className="text-lg">你的航線追蹤儀表板即將上線 — 下一個里程碑會加上訂閱航線的功能。</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Your dashboard is coming soon. Route-subscription will be added in the next milestone.
          </p>
        </div>
      </main>
    </div>
  );
}
