import { data, Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/login";
import { createClient } from "~/lib/supabase.server";

// LOADER: if a real (non-anonymous) presenter is already logged in, skip the form.
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

// ACTION: the email/password form was submitted.
export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers } = createClient(request);
  const formData = await request.formData();

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return data({ error: "Email and password are required." }, { headers });
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Same message whether the email is unknown or the password is wrong,
    // so the page never reveals which emails have accounts.
    const message =
      error.code === "invalid_credentials" ? "Invalid email or password." : error.message;
    return data({ error: message }, { headers });
  }

  // Success: session cookies are in `headers`; pass them along on the redirect.
  return redirect("/", { headers });
}

export default function Login({ actionData }: Route.ComponentProps) {
  const busy = useNavigation().state === "submitting";

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
          required
          className="rounded border px-3 py-2"
        />
        <Link to="/forgot-password" className="-mt-1 self-end text-sm underline">
          Forgot password?
        </Link>

        {actionData?.error && <p className="text-sm text-red-600">{actionData.error}</p>}

        <button
          name="intent"
          value="login"
          disabled={busy}
          className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
        >
          Log in
        </button>
      </Form>

      <p className="mt-6 text-center text-sm">
        Don't have an account?{" "}
        <Link to="/signup" className="underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}
