import { AuthForm } from "@/components/AuthForm";
import { usePageMeta } from "@/lib/page-meta";

export function SignIn() {
  usePageMeta({
    title: "Sign in — Flight Price Notifier",
    description: "Sign in to manage your flight price alerts.",
  });
  return <AuthForm mode="signin" />;
}
