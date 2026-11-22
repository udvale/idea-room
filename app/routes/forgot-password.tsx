import { data, Form, Link, useNavigation } from "react-router";
import type { Route } from "./+types/forgot-password";
import { createClient } from "~/lib/supabase.server";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

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
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>
            Enter your email and we'll send you a link to set a new password.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Form method="post" className="flex flex-col gap-6">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="you@example.com" required />
            </div>

            {actionData && "error" in actionData && (
              <p className="text-sm text-destructive">{actionData.error}</p>
            )}
            {actionData && "message" in actionData && (
              <p className="text-sm text-green-700">{actionData.message}</p>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"}
            </Button>
          </Form>
        </CardContent>

        <CardFooter className="justify-center text-sm">
          <Link to="/login" className="underline underline-offset-4">
            Back to log in
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
