import { Form, useNavigation } from "react-router";

// Its own <Form> so the email/password `required` fields don't block it.
// It posts to whichever route renders it (/login or /signup).
export function OAuthButtons() {
  const busy = useNavigation().state === "submitting";

  return (
    <>
      <p className="my-4 text-center text-sm text-gray-500">or</p>
      <Form method="post" className="flex flex-col gap-2">
        <button
          name="intent"
          value="github"
          disabled={busy}
          className="rounded border px-3 py-2 disabled:opacity-50"
        >
          Continue with GitHub
        </button>
        <button
          name="intent"
          value="google"
          disabled={busy}
          className="rounded border px-3 py-2 disabled:opacity-50"
        >
          Continue with Google
        </button>
      </Form>
    </>
  );
}
