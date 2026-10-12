import { useNavigate } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { GinkgoLeaf } from "@/components/GinkgoLeaf";
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
        <div className="relative mt-8 overflow-hidden rounded-2xl border bg-card p-8 shadow-soft">
          <GinkgoLeaf className="pointer-events-none absolute -bottom-14 -right-6 w-36 -rotate-[24deg] opacity-30" />
          <p className="relative text-lg">你的航線追蹤儀表板即將上線 — 下一個里程碑會加上訂閱航線的功能。</p>
          <p className="relative mt-2 text-sm text-muted-foreground">
            Your dashboard is coming soon. Route-subscription will be added in the next milestone.
          </p>
        </div>
      </main>
    </div>
  );
}
