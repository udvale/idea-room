import { data, redirect } from "react-router";
import type { SupabaseClient } from "@supabase/supabase-js";

export type OAuthProvider = "github" | "google";

export function isOAuthProvider(value: unknown): value is OAuthProvider {
  return value === "github" || value === "google";
}

// Shared by /login and /signup: ask Supabase for the provider's login URL
// and send the browser there. With OAuth, login and signup are the same thing.
export async function startOAuth(
  request: Request,
  supabase: SupabaseClient,
  headers: Headers,
  provider: OAuthProvider,
) {
  const origin = new URL(request.url).origin;
  const { data: oauth, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error) return data({ error: error.message }, { headers });
  // `headers` carries the PKCE cookie that /auth/callback will need.
  return redirect(oauth.url, { headers });
}
