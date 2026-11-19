import { data } from "react-router";
import type { Route } from "./+types/home";
import { createClient } from "~/lib/supabase.server";

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers } = createClient(request);
  const { data: rooms, error } = await supabase.from("rooms").select("*");
  return data({ rooms, error: error?.message ?? null }, { headers });
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return <pre className="p-6">{JSON.stringify(loaderData, null, 2)}</pre>;
}