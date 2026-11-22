import { data, Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/forgot-password";
import { createClient } from "~/lib/supabase.server";
import { Button } from "~/components/ui/button";

// ACTION: ask Supabase to email a reset link. The link comes back through
// /auth/callback (which logs the user in) and then on to /reset-password.
export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers } = createClient(request);
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  if (!email) return data({ error: "Email is required." }, { headers });

  const origin = new URL(request.url).origin;
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  // Real problems (e.g. the email rate limit) are shown. An unknown email is
  // NOT an error in Supabase, so we can't leak whether the account exists.
  if (error) return data({ error: error.message }, { headers });

  // `headers` matters here too: it stores the PKCE cookie the callback needs,
  // which is why the link must be opened in this same browser.
  return data(
    { message: "If an account exists for that email, we've sent a reset link." },
    { headers },
  );
}

export default function ForgotPassword({ actionData }: Route.ComponentProps) {
  const busy = useNavigation().state === "submitting";

  return (
    <main className="mx-auto mt-24 max-w-sm p-6">
      <h1 className="mb-2 text-2xl font-semibold">Reset your password</h1>
      <p className="mb-6 text-sm text-gray-600">
        Enter your email and we'll send you a link to set a new password.
      </p>

      <Form method="post" className="flex flex-col gap-3">
        <input
          name="email"
          type="email"
          placeholder="you@example.com"
          required
          className="rounded border px-3 py-2"
        />

        {actionData && "error" in actionData && (
          <p className="text-sm text-red-600">{actionData.error}</p>
        )}
        {actionData && "message" in actionData && (
          <p className="text-sm text-green-700">{actionData.message}</p>
        )}

        <Button type="submit" size="lg" disabled={busy}>
          Send reset link
        </Button>
      </Form>

      <p className="mt-6 text-center text-sm">
        <Link to="/login" className="underline">
          Back to log in
        </Link>
      </p>
    </main>
  );
}
