import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { createClient } from "~/lib/supabase.server";

// Logout is a POST-only action (no component). Using POST rather than a
// GET link means a prefetch or a crawler can't accidentally log you out.
export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers } = createClient(request);
  await supabase.auth.signOut();
  // signOut() adds Set-Cookie headers that clear the session cookies.
  return redirect("/login", { headers });
}

// Someone typing /logout into the address bar just gets sent home.
export async function loader() {
  return redirect("/");
}
