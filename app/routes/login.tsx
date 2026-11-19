import { data, Form, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/login";
import { createClient } from "~/lib/supabase.server";

// LOADER: runs on the server before the page renders (GET /login).
// If a real (non-anonymous) presenter is already logged in, skip the form.
export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers } = createClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && !user.is_anonymous) {
    return redirect("/", { headers });
  }
  return data(null, { headers });
}

// ACTION: runs on the server when the <Form method="post"> is submitted.
// One form, two buttons: `intent` tells us which one was clicked.
export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers } = createClient(request);
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const intent = formData.get("intent");

  if (!email || !password) {
    return data({ error: "Email and password are required." }, { headers });
  }

  if (intent === "signup") {
    const { data: signUp, error } = await supabase.auth.signUp({ email, password });
    if (error) return data({ error: error.message }, { headers });

    // If email confirmation is on in Supabase, there's no session yet.
    if (!signUp.session) {
      return data({ message: "Check your email to confirm your account." }, { headers });
    }
  } else {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return data({ error: error.message }, { headers });
  }

  // Success: Supabase put the session cookies into `headers`. We MUST
  // pass them along on the redirect, or the browser never gets them.
  return redirect("/", { headers });
}

export default function Login({ actionData }: Route.ComponentProps) {
  const navigation = useNavigation();
  const busy = navigation.state === "submitting";

  return (
    <main className="mx-auto mt-24 max-w-sm p-6">
      <h1 className="mb-6 text-2xl font-semibold">Presenter login</h1>

      <Form method="post" className="flex flex-col gap-3">
        <input
          name="email"
          type="email"
          placeholder="you@example.com"
          required
          className="rounded border px-3 py-2"
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          minLength={6}
          required
          className="rounded border px-3 py-2"
        />

        {actionData && "error" in actionData && (
          <p className="text-sm text-red-600">{actionData.error}</p>
        )}
        {actionData && "message" in actionData && (
          <p className="text-sm text-green-700">{actionData.message}</p>
        )}

        <div className="flex gap-2">
          <button
            name="intent"
            value="login"
            disabled={busy}
            className="flex-1 rounded bg-black px-3 py-2 text-white disabled:opacity-50"
          >
            Log in
          </button>
          <button
            name="intent"
            value="signup"
            disabled={busy}
            className="flex-1 rounded border px-3 py-2 disabled:opacity-50"
          >
            Sign up
          </button>
        </div>
      </Form>
    </main>
  );
}
