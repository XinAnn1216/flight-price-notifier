import { redirect, useRouteLoaderData } from "react-router";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Guards every child route: unauthenticated visitors are sent to /signin.
export async function authenticatedLoader() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw redirect("/signin");
  return { user: data.user };
}

export function useAuthenticatedUser(): User {
  return (useRouteLoaderData("authenticated") as { user: User }).user;
}
