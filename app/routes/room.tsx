import { useEffect, useRef, useState } from "react";
import { data, Form, Link, useFetcher, useNavigation } from "react-router";
import type { Route } from "./+types/room";
import { createClient } from "~/lib/supabase.server";
import { generateIdeas } from "~/lib/gemini.server";
import { Button } from "~/components/ui/button"

const TOP_N = 5; // how many top-voted ideas to send to Gemini
const AI_COUNT = 1; //ai creates 1 new idea each time can change by time 

// LOADER: find the room, make sure the visitor has a session (anonymous if
// needed), then load the ideas and which ones this visitor already voted on.
export async function loader({ request, params }: Route.LoaderArgs) {
  const { supabase, headers } = createClient(request);

  // 1. Find the room first, so a random/mistyped slug doesn't create
  //    anonymous users for nothing. `params.slug` is the `:slug` in the URL.
  const { data: room } = await supabase
    .from("rooms")
    .select("id, slug, title, owner_id")
    .eq("slug", params.slug)
    .maybeSingle(); // returns null instead of an error when there's no match
  if (!room) {
    throw data(null, { status: 404, statusText: "Room not found" });
  }

  // 2. Participants don't log in. If there's no session, create an anonymous
  //    one. Its cookies go into `headers`, so the same visitor keeps the same
  //    user id (and their votes) when they come back.
  let {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const { data: anon, error } = await supabase.auth.signInAnonymously();
    if (error || !anon.user) {
      throw data(null, { status: 500, statusText: error?.message ?? "Couldn't start a session" });
    }
    user = anon.user;
  }

  // 3. Ideas, most-voted first; ties go to the older idea.
  const { data: ideas } = await supabase
    .from("ideas")
    .select("id, content, is_ai, vote_count, author_name")
    .eq("room_id", room.id)
    .order("vote_count", { ascending: false })
    .order("created_at", { ascending: true });

  // 4. Which of these ideas has this visitor already upvoted?
  const ideaIds = (ideas ?? []).map((i) => i.id);
  const { data: myVotes } = ideaIds.length
    ? await supabase.from("votes").select("idea_id").eq("user_id", user.id).in("idea_id", ideaIds)
    : { data: [] };
  const votedIds = (myVotes ?? []).map((v) => v.idea_id as string);

  const displayName = (user.user_metadata?.display_name as string | undefined) ?? null; //for participants

  return data(
    {
      room: { slug: room.slug, title: room.title },
      isOwner: room.owner_id === user.id,
      shareUrl: `${new URL(request.url).origin}/room/${room.slug}`,
      ideas: ideas ?? [],
      votedIds,
      displayName
    },
    { headers },
  );
}

// ACTION: two kinds of submissions, told apart by `intent`:
//   "add"  -> post a new idea
//   "vote" -> toggle my upvote on an idea
// After either one, the loader re-runs, so the list re-sorts by votes.
export async function action({ request, params }: Route.ActionArgs) {
  const { supabase, headers } = createClient(request);
  // `let` so we can replace it below. (A `let user` inside the `if` would be
  // a new variable that disappears at the closing brace.)
  let {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const { data: anon } = await supabase.auth.signInAnonymously(); // no email, no password, no form
    user = anon.user;
  }
  if (!user) {
    return data({ ok: false, error: "Couldn't start a session. Refresh the page." }, { headers });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "set-name") {
    const name = String(formData.get("name") ?? "").trim().slice(0, 40);
    if (!name) return data({ ok: false, error: "Enter a name." }, { headers });

    const { error } = await supabase.auth.updateUser({ data: { display_name: name } });
    if (error) return data({ ok: false, error: error.message }, { headers });
    return data({ ok: true, error: null }, { headers });
  }

  if (intent === "add") {
    const content = String(formData.get("content") ?? "").trim();
    if (content.length < 1 || content.length > 280) {
      return data({ ok: false, error: "Ideas must be 1–280 characters." }, { headers });
    }

    const { data: room } = await supabase
      .from("rooms")
      .select("id")
      .eq("slug", params.slug)
      .maybeSingle();
    if (!room) return data({ ok: false, error: "Room not found." }, { headers });

    const authorName = (user.user_metadata?.display_name as string | undefined) ?? "Anonymous";
    // author_id defaults to auth.uid(); RLS checks it and forces is_ai = false.
    const { error } = await supabase.from("ideas").insert({ room_id: room.id, content, author_name: authorName });
    if (error) return data({ ok: false, error: error.message }, { headers });
    return data({ ok: true, error: null }, { headers });
  }

  if (intent === "vote") {
    const ideaId = String(formData.get("ideaId") ?? "");
    const alreadyVoted = formData.get("voted") === "true";

    // The votes table's primary key (idea_id, user_id) is what really
    // guarantees one vote per user per idea. The trigger updates vote_count.
    const { error } = alreadyVoted
      ? await supabase.from("votes").delete().eq("idea_id", ideaId).eq("user_id", user.id)
      : await supabase.from("votes").insert({ idea_id: ideaId });

    // 23505 = duplicate vote (e.g. double-click). Already voted, so ignore it.
    if (error && error.code !== "23505") {
      return data({ ok: false, error: error.message }, { headers });
    }
    return data({ ok: true, error: null }, { headers });
  }

  if (intent === "generate") {
    const { data: room } = await supabase
      .from("rooms")
      .select("id, title, owner_id")
      .eq("slug", params.slug)
      .maybeSingle();
    if (!room) return data({ ok: false, error: "Room not found." }, { headers });

    // Hiding the button isn't security: anyone can POST intent=generate.
    // So check ownership here, before spending a Gemini call. (RLS also
    // blocks non-owners from inserting is_ai ideas, as a second layer.)
    if (room.owner_id !== user.id) {
      return data({ ok: false, error: "Only the presenter can generate AI ideas." }, { headers });
    }

    const { data: top } = await supabase
      .from("ideas")
      .select("content")
      .eq("room_id", room.id)
      .order("vote_count", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(TOP_N);
    if (!top?.length) {
      return data({ ok: false, error: "Add a few ideas first so the AI has something to build on." }, { headers });
    }

    let generated: string[];
    try {
      generated = await generateIdeas(room.title, top.map((i) => i.content as string), AI_COUNT);
    } catch (e) {
      console.error("Gemini failed:", e); // full details in the server terminal only
      return data({ ok: false, error: "AI generation failed. Please try again." }, { headers });
    }
    if (!generated.length) {
      return data({ ok: false, error: "The AI didn't come up with anything. Try again." }, { headers });
    }

    // One insert for all rows. Allowed by the "presenter posts AI ideas" policy.
    const { error } = await supabase
      .from("ideas")
      .insert(generated.map((content) => ({ room_id: room.id, content, is_ai: true })));
    if (error) return data({ ok: false, error: error.message }, { headers });
    return data({ ok: true, error: null }, { headers });
  }

  return data({ ok: false, error: "Unknown action." }, { headers });
}

export default function Room({ loaderData, actionData }: Route.ComponentProps) {
  const { room, isOwner, shareUrl, ideas, votedIds, displayName } = loaderData;
  const busy = useNavigation().state === "submitting";

  // Clear the textarea after an idea is posted.
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (actionData?.ok) formRef.current?.reset();
  }, [actionData]);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <header className="mb-6">
        {isOwner && (
          <Link to="/" className="text-sm text-gray-500 underline">
            ← My rooms
          </Link>
        )}
        <h1 className="mt-1 text-2xl font-semibold">{room.title}</h1>
        <ShareLink url={shareUrl} />
        {isOwner && <GenerateButton />}
      </header>

      <NameBox displayName={displayName} />

      <Form method="post" ref={formRef} className="mb-8 flex flex-col gap-2">
        <input type="hidden" name="intent" value="add" />
        <textarea
          name="content"
          placeholder="Share an idea…"
          maxLength={280}
          rows={3}
          required
          className="rounded border px-3 py-2"
        />
        <div className="flex items-center justify-between">
          {actionData?.error ? (
            <p className="text-sm text-red-600">{actionData.error}</p>
          ) : (
            <span className="text-xs text-gray-500">Max 280 characters</span>
          )}
          <Button type="submit" size="lg" disabled={busy}>
            Post idea
          </Button>
        </div>
      </Form>

      {ideas.length === 0 ? (
        <p className="text-sm text-gray-500">No ideas yet. Be the first!</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {ideas.map((idea) => (
            <IdeaItem key={idea.id} idea={idea} voted={votedIds.includes(idea.id)} />
          ))}
        </ul>
      )}
    </main>
  );
}

type Idea = { id: string; content: string; is_ai: boolean; vote_count: number; author_name: string | null };

// Each idea gets its own `useFetcher`. A fetcher submits to the action
// without a page navigation, so votes on different ideas don't interfere
// with each other or with the "Post idea" form.
function IdeaItem({ idea, voted }: { idea: Idea; voted: boolean }) {
  // `useFetcher<typeof action>` types fetcher.data as the action's return value.
  const fetcher = useFetcher<typeof action>();
  const pending = fetcher.state !== "idle";
  const error = fetcher.data?.error;

  return (
    <li className="flex items-start gap-3 rounded border p-3">
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="vote" />
        <input type="hidden" name="ideaId" value={idea.id} />
        <input type="hidden" name="voted" value={String(voted)} />
        {/* Filled (default) when I've voted, outlined when I haven't. */}
        <Button
          type="submit"
          variant={voted ? "default" : "outline"}
          disabled={pending}
          aria-label={voted ? "Remove upvote" : "Upvote"}
          className="h-auto w-12 flex-col gap-0 py-1"
        >
          <span>▲</span>
          <span>{idea.vote_count}</span>
        </Button>
      </fetcher.Form>
      <p className="flex-1 whitespace-pre-wrap break-words pt-1">
        {idea.is_ai && (
          <span className="mr-2 rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-800">
            AI
          </span>
        )}
        {idea.content}
        {!idea.is_ai && (
          <span className="mt-1 block text-xs text-gray-500">— {idea.author_name ?? "Anonymous"}</span>
        )}
        {error && <span className="mt-1 block text-sm text-red-600">{error}</span>}
      </p>
    </li>
  );
}

// Separate fetcher so saving a name doesn't touch the idea form.
function NameBox({ displayName }: { displayName: string | null }) {
  const fetcher = useFetcher<typeof action>();
  const [editing, setEditing] = useState(!displayName);

  // Close the form once the name is saved
  useEffect(() => {
    if (fetcher.data?.ok) setEditing(false);
  }, [fetcher.data]);

  if (!editing && displayName) {
    return (
      <p className="mb-3 text-sm text-gray-600">
        Posting as <b>{displayName}</b>{" "}
        <Button
          type="button"
          variant="link"
          size="xs"
          onClick={() => setEditing(true)}
          className="h-auto px-0 underline"
        >
          change
        </Button>
      </p>
    );
  }

  return (
    <fetcher.Form method="post" className="mb-3 flex items-center gap-2">
      <input type="hidden" name="intent" value="set-name" />
      <input
        name="name"
        defaultValue={displayName ?? ""}
        required
        maxLength={40}
        placeholder="Your name (shown on your ideas)"
        className="flex-1 rounded border px-3 py-2 text-sm"
      />
      <Button type="submit" variant="outline" size="lg" disabled={fetcher.state !== "idle"}>
        Save
      </Button>
      {fetcher.data?.error && <span className="text-sm text-red-600">{fetcher.data.error}</span>}
    </fetcher.Form>
  );
}

// Uses a fetcher (not the main <Form>) so its result doesn't clear the
// "Post idea" textarea, and it has its own loading/error state.
function GenerateButton() {
  const fetcher = useFetcher<typeof action>();
  const pending = fetcher.state !== "idle";

  return (
    <fetcher.Form method="post" className="mt-3 flex items-center gap-3">
      <input type="hidden" name="intent" value="generate" />
      {/* Purple on purpose, to match the purple "AI" badge on generated ideas. */}
      <Button
        type="submit"
        size="lg"
        disabled={pending}
        className="bg-purple-700 text-white hover:bg-purple-800"
      >
        {pending ? "Generating…" : `✨ Generate AI idea`}
      </Button>
      {fetcher.data?.error && <span className="text-sm text-red-600">{fetcher.data.error}</span>}
    </fetcher.Form>
  );
}

function ShareLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-2 flex items-center gap-2 text-sm">
      <code className="truncate rounded bg-gray-100 px-2 py-1">{url}</code>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied!" : "Copy"}
      </Button>
    </div>
  );
}
