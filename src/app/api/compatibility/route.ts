import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * The compatibility engine, from the outside.
 *
 * Two things an admin needs and cannot get from the app: which questions
 * people actually answer, and how the scores are distributed. A questionnaire
 * where question 22 is answered by 4% of people is a question phrased badly,
 * and a score distribution bunched at 90% means the weights are too generous
 * to distinguish anyone.
 *
 * Individual answers are never returned. They are private, and an admin
 * reading them would learn what one named person said about jealousy or
 * money — which is not moderation, it is surveillance.
 */

type DimensionRow = {
  key: string;
  label: string;
  question: string;
  kind: string;
  section: string;
  options: string[] | null;
  sort: number;
  quick_start: boolean;
  active: boolean;
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { supabase } = auth;

    const [dimensionRes, answerRes, scoreRes, poolRes, stateRes] = await Promise.all([
      supabase.from("compat_dimensions").select("*").order("sort"),
      // Keys and importances only — never the answers themselves.
      supabase.from("compat_answers").select("key, importance, user_id").limit(20000),
      supabase.from("compat_scores").select("score, blocked").limit(20000),
      supabase.from("discovery_pools").select("user_id, ranked_at, blocked").limit(50000),
      supabase.from("discovery_pool_state").select("user_id, refreshed_at").limit(20000),
    ]);

    if (dimensionRes.error) throw dimensionRes.error;

    const dimensions = (dimensionRes.data ?? []) as DimensionRow[];
    const answers = (answerRes.data ?? []) as {
      key: string;
      importance: string;
      user_id: string;
    }[];
    const scores = (scoreRes.data ?? []) as { score: number; blocked: boolean }[];

    const answered = new Map<string, number>();
    const mustCount = new Map<string, number>();

    for (const row of answers) {
      answered.set(row.key, (answered.get(row.key) ?? 0) + 1);
      if (row.importance === "must") {
        mustCount.set(row.key, (mustCount.get(row.key) ?? 0) + 1);
      }
    }

    const people = new Set(answers.map((row) => row.user_id)).size;

    // Ten-point buckets. Finer than that reads as precision the score does
    // not have.
    const buckets = Array.from({ length: 10 }, (_, index) => ({
      from: index * 10,
      to: index * 10 + 9,
      count: 0,
    }));

    for (const row of scores) {
      const index = Math.min(9, Math.floor(row.score / 10));
      buckets[index].count += 1;
    }

    /*
     * Pool health.
     *
     * Two numbers say whether the pipeline is working. A high unranked
     * share means ranking is not keeping up with pool growth — the deck
     * will be showing cards with no score. Pools that have not refreshed
     * in days belong to people who stopped opening the app, which is
     * churn rather than a bug, but worth being able to see.
     */
    const pools = (poolRes.data ?? []) as { ranked_at: string | null; blocked: boolean }[];
    const states = (stateRes.data ?? []) as { refreshed_at: string }[];
    const dayAgo = Date.now() - 86_400_000;

    return NextResponse.json({
      people,
      pairs: scores.length,
      blocked: scores.filter((row) => row.blocked).length,
      pool: {
        rows: pools.length,
        unranked: pools.filter((row) => row.ranked_at === null).length,
        blocked: pools.filter((row) => row.blocked).length,
        withPools: states.length,
        refreshedToday: states.filter(
          (row) => new Date(row.refreshed_at).getTime() > dayAgo,
        ).length,
      },
      median: scores.length
        ? [...scores].sort((a, b) => a.score - b.score)[Math.floor(scores.length / 2)].score
        : null,
      buckets,
      // The groups that exist, so the editor offers the real ones rather
      // than asking somebody to retype "How you connect" exactly.
      sections: [...new Set(dimensions.map((row) => row.section))].sort(),
      dimensions: dimensions.map((row) => ({
        ...row,
        answered: answered.get(row.key) ?? 0,
        must: mustCount.get(row.key) ?? 0,
        // The number that says whether a question is working: of everyone
        // who has answered anything, how many answered this one.
        rate: people > 0 ? Math.round(((answered.get(row.key) ?? 0) / people) * 100) : 0,
      })),
    });
  } catch (error) {
    return failed(error, "Failed to load compatibility data.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;
    const key = String(body.key ?? "");

    if (!key) {
      return NextResponse.json({ error: "A question key is required." }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    if (typeof body.active === "boolean") update.active = body.active;
    if (typeof body.quick_start === "boolean") update.quick_start = body.quick_start;

    /*
     * The wording, which was not editable at all.
     *
     * A question phrased badly is the single most common reason one goes
     * unanswered — and the only fix available was to switch it off. The
     * key stays fixed: compat_answers rows point at it, so renaming one
     * would orphan every answer already given.
     */
    if (typeof body.label === "string") {
      const label = body.label.trim();
      if (label.length < 2) {
        return NextResponse.json({ error: "That needs a name." }, { status: 400 });
      }
      update.label = label;
    }

    if (typeof body.question === "string") {
      const question = body.question.trim();
      if (question.length < 4) {
        return NextResponse.json(
          { error: "The question is too short to make sense." },
          { status: 400 },
        );
      }
      update.question = question;
    }

    if (typeof body.section === "string" && body.section.trim()) {
      update.section = body.section.trim();
    }

    if ("sort" in body) {
      const sort = Number(body.sort);
      if (!Number.isFinite(sort) || sort < 0 || sort > 10000) {
        return NextResponse.json({ error: "Order is out of range." }, { status: 400 });
      }
      update.sort = Math.round(sort);
    }

    /*
     * Answer options, for choice and multi questions.
     *
     * Editing these is the sharp edge on this route. An answer already
     * given is stored as the option's text, so removing an option leaves
     * everyone who picked it holding a value the question no longer
     * offers — they score as though they never answered. Renaming one
     * does the same thing. Adding is always safe.
     *
     * Allowed rather than blocked, because a typo in an option is worth
     * fixing; the UI says plainly what it costs before it saves.
     */
    if (Array.isArray(body.options)) {
      const options = body.options
        .map((option) => String(option).trim())
        .filter((option) => option.length > 0);

      if (options.length < 2) {
        return NextResponse.json(
          { error: "A question needs at least two answers to choose between." },
          { status: 400 },
        );
      }

      if (new Set(options).size !== options.length) {
        return NextResponse.json(
          { error: "Two answers are the same." },
          { status: 400 },
        );
      }

      update.options = options;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    }

    const { error } = await auth.supabase
      .from("compat_dimensions")
      .update(update)
      .eq("key", key);

    if (error) throw error;

    /*
     * Every cached score is now wrong.
     *
     * Turning a question off changes the denominator for every pair that
     * had answered it, so leaving the cache in place would show scores
     * computed against a questionnaire that no longer exists. They are
     * recomputed on demand, so clearing costs nothing but the first read.
     *
     * Options count too, and did not before: changing what people can
     * pick changes how their answers compare. Wording and order do not —
     * those cannot move a score.
     */
    if (typeof body.active === "boolean" || Array.isArray(body.options)) {
      await auth.supabase.from("compat_scores").delete().gte("score", 0);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to update that dimension.");
  }
}

/** The kinds of question the app knows how to render and score. */
const KINDS = ["choice", "scale", "multi"];

/**
 * A new question.
 *
 * The thirty that exist were seeded in a migration, so adding one meant
 * writing SQL. That is the wrong bar for a question you want to try for
 * a month and drop — which is most of them.
 *
 * A scale is always 1..5 and carries no options; choice and multi need
 * their own answers. Nobody has answered a brand new question, so there
 * is no cache to clear.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;

    /*
     * The key is derived, not typed.
     *
     * It is a database identifier that every answer row points at, and
     * asking an admin to invent one is asking them to invent something
     * with rules they were never told. Built from the name, and never
     * editable afterwards.
     */
    const label = String(body.label ?? "").trim();
    const question = String(body.question ?? "").trim();
    const kind = String(body.kind ?? "");
    const section = String(body.section ?? "").trim();

    if (label.length < 2 || question.length < 4) {
      return NextResponse.json(
        { error: "A question needs a short name and the question itself." },
        { status: 400 },
      );
    }

    if (!KINDS.includes(kind)) {
      return NextResponse.json({ error: "Unknown kind of question." }, { status: 400 });
    }

    if (!section) {
      return NextResponse.json({ error: "Pick a group for it." }, { status: 400 });
    }

    const key = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);

    if (!key) {
      return NextResponse.json(
        { error: "That name has no letters or numbers in it." },
        { status: 400 },
      );
    }

    let options: string[] = [];

    if (kind !== "scale") {
      options = (Array.isArray(body.options) ? body.options : [])
        .map((option) => String(option).trim())
        .filter((option) => option.length > 0);

      if (options.length < 2) {
        return NextResponse.json(
          { error: "A question needs at least two answers to choose between." },
          { status: 400 },
        );
      }

      if (new Set(options).size !== options.length) {
        return NextResponse.json({ error: "Two answers are the same." }, { status: 400 });
      }
    }

    // Last in its group unless told otherwise, so a new question does not
    // silently jump ahead of ones people are used to seeing first.
    const { data: last } = await auth.supabase
      .from("compat_dimensions")
      .select("sort")
      .eq("section", section)
      .order("sort", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await auth.supabase
      .from("compat_dimensions")
      .insert({
        key,
        label,
        question,
        kind,
        section,
        options,
        sort: ((last?.sort as number | undefined) ?? 0) + 10,
        quick_start: body.quick_start === true,
        active: body.active !== false,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A question with that name already exists." },
          { status: 409 },
        );
      }
      throw error;
    }

    return NextResponse.json({ dimension: data });
  } catch (error) {
    return failed(error, "Failed to add that question.");
  }
}

/**
 * Removing a question.
 *
 * compat_answers.key is ON DELETE CASCADE, so deleting a question also
 * deletes every answer anybody ever gave it. That is not recoverable and
 * it is not what "I want to stop asking this" usually means — switching
 * it off already does that, keeps the answers, and is reversible.
 *
 * So a question anybody has answered is refused here, with the count and
 * a pointer at the off switch. One nobody has answered is deleted
 * outright: there is nothing to lose and no reason to keep it.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const key = new URL(request.url).searchParams.get("key") ?? "";
    const force = new URL(request.url).searchParams.get("force") === "true";

    if (!key) {
      return NextResponse.json({ error: "Missing question." }, { status: 400 });
    }

    const { count, error: countError } = await auth.supabase
      .from("compat_answers")
      .select("key", { count: "exact", head: true })
      .eq("key", key);

    if (countError) throw countError;

    const answered = count ?? 0;

    if (answered > 0 && !force) {
      return NextResponse.json(
        {
          error: `${answered} ${answered === 1 ? "person has" : "people have"} answered this. Deleting it throws those answers away for good — switch it off instead to stop asking while keeping them.`,
          answered,
        },
        { status: 409 },
      );
    }

    const { error } = await auth.supabase
      .from("compat_dimensions")
      .delete()
      .eq("key", key);

    if (error) throw error;

    // The questionnaire changed shape, so every cached score is stale.
    await auth.supabase.from("compat_scores").delete().gte("score", 0);

    return NextResponse.json({ ok: true, answersDeleted: answered });
  } catch (error) {
    return failed(error, "Failed to remove that question.");
  }
}
