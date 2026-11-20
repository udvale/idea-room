import { useEffect, useRef, useState } from "react";
import { data, Form, Link, useFetcher, useNavigation } from "react-router";
import type { Route } from "./+types/room";
import { createClient } from "~/lib/supabase.server";

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
    .select("id, content, is_ai, vote_count")
    .eq("room_id", room.id)
    .order("vote_count", { ascending: false })
    .order("created_at", { ascending: true });

  // 4. Which of these ideas has this visitor already upvoted?
  const ideaIds = (ideas ?? []).map((i) => i.id);
  const { data: myVotes } = ideaIds.length
    ? await supabase.from("votes").select("idea_id").eq("user_id", user.id).in("idea_id", ideaIds)
    : { data: [] };
  const votedIds = (myVotes ?? []).map((v) => v.idea_id as string);

  return data(
    {
      room: { slug: room.slug, title: room.title },
      isOwner: room.owner_id === user.id,
      shareUrl: `${new URL(request.url).origin}/room/${room.slug}`,
      ideas: ideas ?? [],
      votedIds,
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return data({ ok: false, error: "Your session expired. Refresh the page." }, { headers });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

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

    // author_id defaults to auth.uid(); RLS checks it and forces is_ai = false.
    const { error } = await supabase.from("ideas").insert({ room_id: room.id, content });
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

  return data({ ok: false, error: "Unknown action." }, { headers });
}

export default function Room({ loaderData, actionData }: Route.ComponentProps) {
  const { room, isOwner, shareUrl, ideas, votedIds } = loaderData;
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
      </header>

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
          <button
            disabled={busy}
            className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            Post idea
          </button>
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

type Idea = { id: string; content: string; is_ai: boolean; vote_count: number };

// Each idea gets its own `useFetcher`. A fetcher submits to the action
// without a page navigation, so votes on different ideas don't interfere
// with each other or with the "Post idea" form.
function IdeaItem({ idea, voted }: { idea: Idea; voted: boolean }) {
  const fetcher = useFetcher();
  const pending = fetcher.state !== "idle";

  return (
    <li className="flex items-start gap-3 rounded border p-3">
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="vote" />
        <input type="hidden" name="ideaId" value={idea.id} />
        <input type="hidden" name="voted" value={String(voted)} />
        <button
          disabled={pending}
          aria-label={voted ? "Remove upvote" : "Upvote"}
          className={`flex w-12 flex-col items-center rounded border px-2 py-1 text-sm disabled:opacity-50 ${
            voted ? "border-black bg-black text-white" : ""
          }`}
        >
          <span>▲</span>
          <span>{idea.vote_count}</span>
        </button>
      </fetcher.Form>
      <p className="flex-1 whitespace-pre-wrap break-words pt-1">
        {idea.is_ai && (
          <span className="mr-2 rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-800">
            AI
          </span>
        )}
        {idea.content}
      </p>
    </li>
  );
}

function ShareLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-2 flex items-center gap-2 text-sm">
      <code className="truncate rounded bg-gray-100 px-2 py-1">{url}</code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="rounded border px-2 py-1"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
