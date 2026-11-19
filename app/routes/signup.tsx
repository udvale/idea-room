import { data, Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/signup";
import { createClient } from "~/lib/supabase.server";
import { isOAuthProvider, startOAuth } from "~/lib/oauth.server";
import { OAuthButtons } from "~/components/OAuthButtons";

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
  const intent = formData.get("intent");

  if (isOAuthProvider(intent)) {
    return startOAuth(request, supabase, headers, intent);
  }

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return data({ error: "Email and password are required." }, { headers });
  }

  const { data: signUp, error } = await supabase.auth.signUp({ email, password });
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

      <OAuthButtons />

      <p className="mt-6 text-center text-sm">
        Already have an account?{" "}
        <Link to="/login" className="underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
