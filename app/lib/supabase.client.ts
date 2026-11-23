import { createBrowserClient } from "@supabase/ssr";

export function getBrowserClient(url: string, publishableKey: string) {
  return createBrowserClient(url, publishableKey);
}
