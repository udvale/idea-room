import { redirect } from "react-router";
import type { Route } from "./+types/auth.callback";
import { createClient } from "~/lib/supabase.server";

// Supabase sends users back here with ?code=... after they click a link in
// an auth email (password reset, or sign-up confirmation if that's turned on).
// We trade that one-time code for a real session (sets the auth cookies),
// then go to `next` (default: home).
export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers } = createClient(request);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return redirect(next, { headers });
  }

  // No code, or the exchange failed (cancelled login, expired/reused link,
  // or a reset link opened in a different browser).
  return redirect("/login", { headers });
}

// Only allow paths on our own site. Without this, a crafted link like
// ?next=https://evil.com would turn our login into a redirect to any site.
function safeNext(next: string | null) {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/";
}
