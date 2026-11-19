import { data, Form, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/reset-password";
import { createClient } from "~/lib/supabase.server";

// LOADER: the reset link already logged the user in (via /auth/callback).
// No session means they got here without a valid link.
export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, headers } = createClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    return redirect("/forgot-password", { headers });
  }
  return data(null, { headers });
}

// ACTION: save the new password on the logged-in user.
export async function action({ request }: Route.ActionArgs) {
  const { supabase, headers } = createClient(request);
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password !== confirm) {
    return data({ error: "Passwords don't match." }, { headers });
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return data({ error: error.message }, { headers });

  return redirect("/", { headers });
}

export default function ResetPassword({ actionData }: Route.ComponentProps) {
  const busy = useNavigation().state === "submitting";

  return (
    <main className="mx-auto mt-24 max-w-sm p-6">
      <h1 className="mb-6 text-2xl font-semibold">Choose a new password</h1>

      <Form method="post" className="flex flex-col gap-3">
        <input
          name="password"
          type="password"
          placeholder="New password (min 6 characters)"
          minLength={6}
          required
          className="rounded border px-3 py-2"
        />
        <input
          name="confirm"
          type="password"
          placeholder="Confirm new password"
          minLength={6}
          required
          className="rounded border px-3 py-2"
        />

        {actionData?.error && <p className="text-sm text-red-600">{actionData.error}</p>}

        <button
          disabled={busy}
          className="rounded bg-black px-3 py-2 text-white disabled:opacity-50"
        >
          Save password
        </button>
      </Form>
    </main>
  );
}
