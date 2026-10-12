import { AuthForm } from "@/components/AuthForm";
import { usePageMeta } from "@/lib/page-meta";

export function SignUp() {
  usePageMeta({
    title: "Sign up — Flight Price Notifier",
    description: "Create an account and get emailed when Taipei fares drop.",
  });
  return <AuthForm mode="signup" />;
}
