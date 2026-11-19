import { createServerClient, parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";

export function createClient(request: Request) {
  const headers = new Headers();

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get("Cookie") ?? "").map(({ name, value }) => ({
            name,
            value: value ?? "",
          }));
        },
        setAll(cookiesToSet, cacheHeaders) {
          cookiesToSet.forEach(({ name, value, options }) =>
            headers.append("Set-Cookie", serializeCookieHeader(name, value, options)),
          );
          Object.entries(cacheHeaders ?? {}).forEach(([k, v]) => headers.set(k, v));
        },
      },
    },
  );

  return { supabase, headers };
}