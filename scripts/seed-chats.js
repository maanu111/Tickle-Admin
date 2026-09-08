/*
 * Conversations, so the Chat and Sparks tabs have something in them.
 *
 * The profiles seeder fills the deck; nothing filled what happens after
 * a match. Both tabs were empty, which makes them impossible to judge —
 * an unread badge, a preview line and a timestamp only look right or
 * wrong against real rows.
 *
 * Two things this gets right that a naive insert does not:
 *
 * `state` defaults to 'pending', which is a match nobody has opened yet
 * and which the app counts down to expiry. A conversation with messages
 * in it is 'open', so these are set explicitly.
 *
 * `last_message_at` drives the order of the chat list, and each row's
 * timestamps are backdated to a plausible spread rather than all set to
 * now — a list where every conversation happened in the same second
 * tells you nothing about whether the sorting works.
 */

const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const env = {};
fs.readFileSync(".env", "utf8")
  .split(/\r?\n/)
  .forEach((line) => {
    const match = line.match(/^([A-Z_]+)\s*=\s*(.*)$/);
    if (match) env[match[1]] = match[2].trim();
  });

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/*
 * Openers and replies, written the way people here actually text.
 *
 * Short, lowercase, a bit of Hinglish. Generic filler ("Hey! How are
 * you?") makes every conversation look the same, which defeats the
 * point of having a list to look at.
 */
const OPENERS = [
  "heyy, your pics are so good 😭 where was the second one taken",
  "okay but Sukhna at 6am is a bold claim, do you actually go",
  "hi! saw you like the same cafes as me, sector 9 gang",
  "your bio made me laugh ngl",
  "hey, so are we doing the Kasauli trip or not 😄",
  "hii, how's your week going?",
  "the dog in your third pic — name please, this is important",
  "hey! finally someone else who reads in cafes",
];

const REPLIES = [
  "haha thank youu 🙈 that was in Manali last winter",
  "i do actually! not every day but i try, it's so peaceful",
  "yesss sector 9 forever, have you tried the new place near the market",
  "haha thanks, took me forever to write",
  "obviously doing it, when are you free",
  "pretty good! busy week at work but surviving 😅",
  "her name is Coco and she is the love of my life",
  "right?? nobody gets it. what are you reading now",
];

const FOLLOWUPS = [
  "we should go sometime honestly",
  "okay you have good taste, noted",
  "haha fair enough",
  "so what do you do btw?",
  "free this weekend?",
  "let me know when you're around",
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const intBetween = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

async function main() {
  const count = Number(process.argv[2] ?? 12);
  const email = process.argv[3];

  /*
   * Whose chats these are.
   *
   * Defaults to the only non-seeded account with a finished profile,
   * because that is the one somebody is testing with. Passing an email
   * overrides it.
   */
  const { data: me } = email
    ? await db.from("profiles").select("user_id, name").eq("email", email).maybeSingle()
    : await db
        .from("profiles")
        .select("user_id, name")
        .not("email", "like", "%@tickle.seed")
        .not("name", "is", null)
        .limit(1)
        .maybeSingle();

  if (!me) {
    console.log("No account to seed chats for. Pass an email as the second argument.");
    return;
  }

  console.log(`Seeding ${count} conversations for ${me.name}.\n`);

  // Seeded people they are not already matched with.
  const { data: existing } = await db
    .from("matches")
    .select("user1_id, user2_id")
    .or(`user1_id.eq.${me.user_id},user2_id.eq.${me.user_id}`);

  const taken = new Set(
    (existing ?? []).flatMap((row) => [row.user1_id, row.user2_id]),
  );

  const { data: candidates } = await db
    .from("profiles")
    .select("user_id, name")
    .like("email", "%@tickle.seed")
    .limit(200);

  const pool = (candidates ?? []).filter((row) => !taken.has(row.user_id));

  if (pool.length === 0) {
    console.log("Already matched with everybody seeded. Nothing to add.");
    return;
  }

  let made = 0;

  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const other = pool[i];

    /*
     * Matched at some point in the last fortnight, and each message a
     * few minutes after the one before. Ordering is the thing being
     * tested here, so the timestamps have to actually differ.
     */
    const matchedAt = new Date(Date.now() - intBetween(1, 14) * 86_400_000);

    const { data: match, error } = await db
      .from("matches")
      .insert({
        user1_id: me.user_id,
        user2_id: other.user_id,
        // Explicit: the column defaults to 'pending', which is a match
        // nobody has opened and which expires on a countdown.
        state: "open",
        expires_at: null,
        opened_at: matchedAt.toISOString(),
        created_at: matchedAt.toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.log(`  ${i + 1}. ${other.name}: ${error.message.slice(0, 60)}`);
      continue;
    }

    /*
     * A third of them have no reply yet.
     *
     * A chat list where every row has a back-and-forth hides the state
     * that actually needs designing for — the one where somebody said
     * hello and is waiting.
     */
    const oneSided = Math.random() < 0.33;
    const turns = oneSided ? 1 : intBetween(2, 5);

    const lines = [];
    let when = new Date(matchedAt.getTime() + intBetween(5, 90) * 60_000);

    for (let turn = 0; turn < turns; turn++) {
      // They open. Alternating after that.
      const fromThem = turn % 2 === 0;

      const content =
        turn === 0 ? pick(OPENERS) : turn === 1 ? pick(REPLIES) : pick(FOLLOWUPS);

      lines.push({
        match_id: match.id,
        sender_id: fromThem ? other.user_id : me.user_id,
        content,
        // Unread only when they spoke last: a message you sent yourself
        // showing as unread is the kind of thing that makes a badge
        // untrustworthy.
        read: !fromThem,
        created_at: when.toISOString(),
      });

      when = new Date(when.getTime() + intBetween(2, 120) * 60_000);
    }

    const { error: msgError } = await db.from("messages").insert(lines);

    if (msgError) {
      console.log(`  ${i + 1}. ${other.name}: messages failed — ${msgError.message.slice(0, 50)}`);
      await db.from("matches").delete().eq("id", match.id);
      continue;
    }

    // The chat list sorts on this, so it has to match the last line
    // rather than the moment the row was written.
    const lastAt = lines[lines.length - 1].created_at;
    await db.from("matches").update({ last_message_at: lastAt }).eq("id", match.id);

    made += 1;
    console.log(
      `  ${String(made).padStart(2)}. ${(other.name ?? "").padEnd(20)} ${lines.length} message${lines.length === 1 ? "" : "s"}${oneSided ? "  (waiting on a reply)" : ""}`,
    );
  }

  console.log(`\nDone. ${made} conversations.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
