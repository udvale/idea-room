import { useEffect, useRef } from "react";
import { data, Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/home";
import { createClient } from "~/lib/supabase.server";
import { makeSlug } from "~/lib/slug.server";
import { Button } from "~/components/ui/button";

// LOADER: home is the presenter dashboard, so only real (non-anonymous)
// users get in. Everyone else goes to /login.
export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers } = createClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    return redirect("/login", { headers });
  }

  // RLS lets anyone read every room (participants need that to join by slug),
  // so we must filter to "my rooms" ourselves with .eq("owner_id", ...).
  const { data: rooms, error } = await supabase
    .from("rooms")
    .select("id, slug, title")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  return data(
    { email: user.email ?? "", rooms: rooms ?? [], error: error?.message ?? null },
    { headers },
  );
}

// ACTION: create a room. After an action finishes, React Router re-runs the
// loader automatically, so the new room shows up in the list by itself.
export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers } = createClient(request);

  // Actions can be called directly (not just from our form), so check who's
  // calling here too. Never rely only on the loader's redirect.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return data({ ok: false, error: "You need to be logged in to create a room." }, { headers });
  }

  const formData = await request.formData();
  const title = String(formData.get("title") ?? "").trim();

  if (title.length < 1 || title.length > 120) {
    return data({ ok: false, error: "Title must be 1–120 characters." }, { headers });
  }

  // owner_id isn't sent: the column defaults to auth.uid(), and RLS checks
  // that it matches the logged-in, non-anonymous user.
  // The slug is random, but if it ever collides with an existing one
  // (Postgres unique violation, code 23505), just try a new one.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await supabase.from("rooms").insert({ title, slug: makeSlug(title) });
    if (!error) return data({ ok: true, error: null }, { headers });
    if (error.code !== "23505") {
      return data({ ok: false, error: error.message }, { headers });
    }
  }
  return data({ ok: false, error: "Couldn't create a unique link, try again." }, { headers });
}

export default function Home({ loaderData, actionData }: Route.ComponentProps) {
  const { email, rooms, error } = loaderData;
  const busy = useNavigation().state === "submitting";

  // Clear the title input after a room is created successfully.
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (actionData?.ok) formRef.current?.reset();
  }, [actionData]);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Idea Room</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-600">{email}</span>
          <Form method="post" action="/logout">
            <Button type="submit" variant="outline" size="sm">
              Log out
            </Button>
          </Form>
        </div>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium">Create a room</h2>
        <Form method="post" ref={formRef} className="flex gap-2">
          <input
            name="title"
            placeholder="e.g. Q3 product ideas"
            maxLength={120}
            required
            className="flex-1 rounded border px-3 py-2"
          />
          <Button type="submit" size="lg" disabled={busy}>
            Create
          </Button>
        </Form>
        {actionData?.error && <p className="mt-2 text-sm text-red-600">{actionData.error}</p>}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">My rooms</h2>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {rooms.length === 0 ? (
          <p className="text-sm text-gray-500">No rooms yet. Create one above.</p>
        ) : (
          <ul className="divide-y rounded border">
            {rooms.map((room) => (
              <li key={room.id}>
                <Link
                  to={`/room/${room.slug}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                >
                  <span className="font-medium">{room.title}</span>
                  <span className="font-mono text-sm text-gray-500">/room/{room.slug}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
