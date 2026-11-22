import { data, Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/login";
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
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Presenter login</CardTitle>
          <CardDescription>Enter your email below to log in to your account</CardDescription>
        </CardHeader>

        <CardContent>
          <Form method="post" className="flex flex-col gap-6">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="you@example.com" required />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center">
                <Label htmlFor="password">Password</Label>
                <Link
                  to="/forgot-password"
                  className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                >
                  Forgot your password?
                </Link>
              </div>
              <Input id="password" name="password" type="password" required />
            </div>

            {actionData?.error && <p className="text-sm text-destructive">{actionData.error}</p>}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Logging in…" : "Log in"}
            </Button>
          </Form>
        </CardContent>

        <CardFooter className="justify-center text-sm">
          Don't have an account?&nbsp;
          <Link to="/signup" className="underline underline-offset-4">
            Sign up
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
