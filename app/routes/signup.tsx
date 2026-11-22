import { data, Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/signup";
import { createClient } from "~/lib/supabase.server";

// Same as /login: a logged-in presenter doesn't need this page.
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

export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers } = createClient(request);
  const formData = await request.formData();

  const displayName = String(formData.get("displayName") ?? "").trim();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!displayName || !email || !password) {
    return data({ error: "Name, email and password are required." }, { headers });
  }
  if (displayName.length > 15) {
    return data({ error: "Display name must be 40 characters or less." }, { headers });
  }

  // `options.data` is saved as the user's metadata (user.user_metadata).
  // Participants' names go in the same `display_name` field later, so the
  // room page can read one field for everyone.
  const { data: signUp, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) return data({ error: error.message }, { headers });


  // If "Confirm email" is on in Supabase, there's no session until they click the link.
  if (!signUp.session) {
    return data({ message: "Check your email to confirm your account." }, { headers });
  }

  return redirect("/", { headers });
}

export default function Signup({ actionData }: Route.ComponentProps) {
  const busy = useNavigation().state === "submitting";

  return (
    <main className="mx-auto mt-24 max-w-sm p-6">
      <h1 className="mb-6 text-2xl font-semibold">Create a presenter account</h1>

      <Form method="post" className="flex flex-col gap-3">
        <input
          name="displayName"
          placeholder="Display name"
          maxLength={40}
          required
          className="rounded border px-3 py-2"
        />
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
          placeholder="Password (min 6 characters)"
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

        <button
          name="intent"
          value="signup"
          disabled={busy}
          className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
        >
          Sign up
        </button>
      </Form>

      <p className="mt-6 text-center text-sm">
        Already have an account?{" "}
        <Link to="/login" className="underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
