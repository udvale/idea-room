import { data, Form, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/reset-password";
import { createClient } from "~/lib/supabase.server";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

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
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>You'll be logged in once it's saved.</CardDescription>
        </CardHeader>

        <CardContent>
          <Form method="post" className="flex flex-col gap-6">
            <div className="grid gap-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="At least 6 characters"
                minLength={6}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input id="confirm" name="confirm" type="password" minLength={6} required />
            </div>

            {actionData?.error && <p className="text-sm text-destructive">{actionData.error}</p>}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Saving…" : "Save password"}
            </Button>
          </Form>
        </CardContent>
      </Card>
    </main>
  );
}
