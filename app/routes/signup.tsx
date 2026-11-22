import { data, Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/signup";
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

// One place for the limit, used by both the server check and the input.
const MAX_NAME = 15;

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
  if (displayName.length > MAX_NAME) {
    return data(
      { error: `Display name must be ${MAX_NAME} characters or less.` },
      { headers },
    );
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
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create a presenter account</CardTitle>
          <CardDescription>Presenters create rooms and share the link with participants</CardDescription>
        </CardHeader>

        <CardContent>
          <Form method="post" className="flex flex-col gap-6">
            <div className="grid gap-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                name="displayName"
                maxLength={MAX_NAME}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="you@example.com" required />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="At least 6 characters"
                minLength={6}
                required
              />
            </div>

            {actionData && "error" in actionData && (
              <p className="text-sm text-destructive">{actionData.error}</p>
            )}
            {actionData && "message" in actionData && (
              <p className="text-sm text-green-700">{actionData.message}</p>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Creating account…" : "Sign up"}
            </Button>
          </Form>
        </CardContent>

        <CardFooter className="justify-center text-sm">
          Already have an account?&nbsp;
          <Link to="/login" className="underline underline-offset-4">
            Log in
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
