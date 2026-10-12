import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { supabase } from "@/integrations/supabase/client";
import { GinkgoLeaf } from "./GinkgoLeaf";
import { Logo } from "./Logo";

export function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isSignUp = mode === "signup";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { data, error } = isSignUp
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/app` } })
      : await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setError(error.message);
    if (data.session) navigate("/app");
    else setError("請到信箱確認後再登入 / Check your email to confirm your account.");
  }

  const input =
    "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 bg-glow" />
      <GinkgoLeaf className="pointer-events-none absolute -right-10 bottom-6 w-48 rotate-[24deg] opacity-80 drop-shadow-[0_20px_18px_oklch(0.45_0.08_60/0.25)] sm:right-[8%] sm:w-64" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border bg-card/95 p-6 shadow-soft backdrop-blur-sm">
          <h1 className="text-2xl font-semibold">{isSignUp ? "建立帳號 / Sign up" : "登入 / Sign in"}</h1>
          <label className="block space-y-1.5 text-sm">
            <span className="text-muted-foreground">Email</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="you@example.com" />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="text-muted-foreground">Password</span>
            <input type="password" required minLength={6} autoComplete={isSignUp ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button disabled={loading} className="w-full rounded-full bg-primary py-2.5 text-sm font-medium text-primary-foreground shadow-soft transition hover:brightness-105 disabled:opacity-50">
            {loading ? "..." : isSignUp ? "Sign up / 註冊" : "Sign in / 登入"}
          </button>
          <p className="text-center text-sm text-muted-foreground">
            {isSignUp ? "已有帳號？" : "還沒有帳號？"}{" "}
            <Link to={isSignUp ? "/signin" : "/signup"} className="font-medium text-accent-foreground hover:underline">
              {isSignUp ? "Sign in" : "Sign up"}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
