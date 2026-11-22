import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client, used ONLY for realtime subscriptions.
// All reads and writes still go through loaders/actions on the server.
//
// The URL and publishable key come from loader data (see room.tsx). Both are
// safe to expose: the publishable key is public by design, and RLS is what
// protects the data. createBrowserClient reuses one client per page, and it
// reads the same auth cookies the server set, so realtime runs as this user.
export function getBrowserClient(url: string, publishableKey: string) {
  return createBrowserClient(url, publishableKey);
}
