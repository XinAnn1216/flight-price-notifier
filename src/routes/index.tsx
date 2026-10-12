import { Link } from "react-router";
import { Radar, BellRing, CircleSlash } from "lucide-react";
import { Logo } from "@/components/Logo";
import { FadeIn } from "@/components/FadeIn";
import { usePageMeta } from "@/lib/page-meta";

const features = [
  { icon: Radar, title: "盯緊熱門航線 (Always-on route watching)", body: "持續監控台北出發的熱門航線（東京、首爾），自動抓最低票價。" },
  { icon: BellRing, title: "達標自動通知 (Target-price email alerts)", body: "低於你設定的目標價，就寄 email 提醒你，附上立即訂購連結。" },
  { icon: CircleSlash, title: "隨時取消 (Cancel anytime)", body: "月訂閱制，不想用隨時停，沒有綁約。" },
];

export function Index() {
  usePageMeta({
    title: "Flight Price Notifier — 機票降價通知",
    description: "Set a route and a target price — we email you when the fare from Taipei drops.",
    ogDescription: "Set a route and a target price — we email you when the fare drops.",
  });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Logo />
          <Link to="/signin" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90">
            Sign in / 登入
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-glow" />
          <div className="relative mx-auto max-w-4xl px-4 py-28 text-center sm:py-36">
            <FadeIn>
              <span className="inline-block rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">台北出發 · TPE → NRT / ICN</span>
              <h1 className="mt-6 text-5xl font-bold tracking-tight text-gradient sm:text-7xl">Flight Price Notifier</h1>
              <p className="mt-6 text-xl sm:text-2xl">設定航線與目標價，機票降價就通知你</p>
              <p className="mt-3 text-muted-foreground">Set a route and a target price — we email you when the fare drops.</p>
              <Link to="/signup" className="mt-10 inline-block rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition hover:opacity-90">
                免費開始 / Get started
              </Link>
            </FadeIn>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-5 px-4 pb-28 md:grid-cols-3">
          {features.map((f, i) => (
            <FadeIn key={f.title} delay={i * 120}>
              <div className="h-full rounded-2xl border bg-card p-6 transition hover:border-primary/50">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-accent text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            </FadeIn>
          ))}
        </section>
      </main>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">© 2026 Flight Price Notifier</footer>
    </div>
  );
}
