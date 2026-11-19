// No 0/o or 1/l, so slugs are easy to read aloud or type from a projector.
const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

// "Team Brainstorm!" -> "team-brainstorm-k7x2pq"
// The readable part is just for humans; the random suffix makes it unique.
export function makeSlug(title: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // anything else becomes a dash
    .slice(0, 40)
    .replace(/^-+|-+$/g, ""); // trim leading/trailing dashes

  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const suffix = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");

  return base ? `${base}-${suffix}` : suffix;
}
