import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * One query, every table worth searching.
 *
 * The palette could find pages and members, and nothing else. Everything
 * else in the database — the café somebody dropped a heart at, the scam
 * pattern with a typo in it, the promo code from last month, the job
 * title that needs a synonym — could only be found by remembering which
 * screen owned it and searching there.
 *
 * That is the wrong way round. Somebody typing "kulcha" wants the venue
 * wherever it lives; making them first recall that venues are under
 * Places is asking them to know the panel's filing system before they
 * can use it.
 *
 * Read-only, and through the service role because RLS scopes most of
 * these to the signed-in member. Every result is a pointer at a screen
 * that already knows how to show and edit the thing — nothing is
 * editable from here.
 */

/*
 * What gets searched, and where a hit sends you.
 *
 * `columns` is what the query matches against; `label` and `hint` are
 * what the reader sees. Adding a table here is the whole job of making
 * it findable, which is deliberate: a table nobody added is invisible,
 * and that is a loud enough omission to notice.
 */
const SOURCES: {
  table: string;
  kind: string;
  /** What this is called in the results, as a group heading. */
  group: string;
  select: string;
  columns: string[];
  label: (row: Record<string, unknown>) => string;
  hint: (row: Record<string, unknown>) => string;
  href: (row: Record<string, unknown>) => string;
}[] = [
  {
    table: "profiles",
    kind: "member",
    group: "Members",
    select: "user_id, name, email, city, photos",
    columns: ["name", "email", "city"],
    label: (row) => String(row.name ?? row.email ?? "Unnamed"),
    hint: (row) => [row.email, row.city].filter(Boolean).join(" · "),
    href: (row) => `/members/${row.user_id}`,
  },
  {
    table: "places",
    kind: "place",
    group: "Venues",
    select: "id, name, address, category",
    columns: ["name", "address", "category"],
    label: (row) => String(row.name ?? "Unnamed venue"),
    hint: (row) => String(row.address ?? row.category ?? ""),
    href: () => "/places",
  },
  {
    table: "professions",
    kind: "job",
    group: "Job list",
    select: "id, name, category",
    columns: ["name", "category"],
    label: (row) => String(row.name ?? ""),
    hint: (row) => String(row.category ?? ""),
    href: () => "/fields?tab=jobs",
  },
  {
    table: "compat_dimensions",
    kind: "question",
    group: "Matching questions",
    select: "key, label, question, section",
    columns: ["label", "question", "section"],
    label: (row) => String(row.question ?? row.label ?? ""),
    hint: (row) => String(row.section ?? ""),
    href: () => "/compatibility",
  },
  {
    table: "profile_fields",
    kind: "field",
    group: "Profile fields",
    select: "id, key, label, hint, group_key",
    columns: ["label", "hint", "key"],
    label: (row) => String(row.label ?? ""),
    hint: (row) => String(row.hint ?? row.group_key ?? ""),
    href: () => "/fields",
  },
  {
    table: "profile_prompts",
    kind: "prompt",
    group: "Prompts",
    select: "id, question, kind",
    columns: ["question"],
    label: (row) => String(row.question ?? ""),
    hint: (row) => (row.kind === "voice" ? "Spoken" : "Written"),
    href: () => "/fields?tab=prompts",
  },
  {
    table: "safety_rules",
    kind: "rule",
    group: "Safety patterns",
    select: "id, label, pattern, category",
    columns: ["label", "pattern", "category"],
    label: (row) => String(row.label ?? ""),
    hint: (row) => String(row.pattern ?? ""),
    href: () => "/safety?view=patterns",
  },
  {
    table: "venue_categories",
    kind: "category",
    group: "Venue kinds",
    select: "id, label, category, allowed",
    columns: ["label", "category"],
    label: (row) => String(row.label ?? row.category ?? ""),
    hint: (row) => (row.allowed ? "Hearts allowed" : "Hearts refused"),
    href: () => "/places",
  },
  {
    table: "promo_codes",
    kind: "code",
    group: "Promo codes",
    select: "id, code, label, active",
    columns: ["code", "label"],
    label: (row) => String(row.code ?? ""),
    hint: (row) => String(row.label ?? ""),
    href: () => "/codes",
  },
  {
    table: "premium_offers",
    kind: "offer",
    group: "Trials and offers",
    select: "id, key, label, body",
    columns: ["label", "key", "body"],
    label: (row) => String(row.label ?? ""),
    hint: (row) => String(row.body ?? ""),
    href: () => "/plans",
  },
  {
    table: "plans",
    kind: "plan",
    group: "Plans",
    select: "key, label, tagline",
    columns: ["label", "key", "tagline"],
    label: (row) => String(row.label ?? ""),
    hint: (row) => String(row.tagline ?? ""),
    href: () => "/plans",
  },
  {
    table: "referral_milestones",
    kind: "milestone",
    group: "Invite rewards",
    select: "id, key, label, reward_kind",
    columns: ["label", "key"],
    label: (row) => String(row.label ?? ""),
    hint: (row) => `Pays ${String(row.reward_kind ?? "")}`.replace(/_/g, " "),
    href: () => "/codes",
  },
  {
    table: "support_tickets",
    kind: "ticket",
    group: "Support tickets",
    select: "id, subject, status",
    columns: ["subject"],
    label: (row) => String(row.subject ?? "No subject"),
    hint: (row) => String(row.status ?? ""),
    href: () => "/safety?view=tickets",
  },
];

/*
 * PostgREST reads commas and dots inside or() as syntax.
 *
 * A search for "a,b" or "sector 17." would otherwise be parsed as extra
 * conditions rather than as text, which fails the request instead of
 * finding nothing. Percent and underscore are LIKE wildcards and get the
 * same treatment.
 */
function clean(term: string): string {
  return term.replace(/[,.%_()\\]/g, " ").trim();
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const raw = (new URL(request.url).searchParams.get("q") ?? "").trim();
    const term = clean(raw);

    // Two characters is the shortest query worth thirteen round trips.
    if (term.length < 2) return NextResponse.json({ results: [] });

    const responses = await Promise.all(
      SOURCES.map(async (source) => {
        const filter = source.columns
          .map((column) => `${column}.ilike.%${term}%`)
          .join(",");

        const { data, error } = await auth.supabase
          .from(source.table)
          .select(source.select)
          .or(filter)
          .limit(5);

        // One missing table must not empty the whole search. A source
        // that errors simply contributes nothing.
        if (error) return [];

        return (data ?? []).map((row) => {
          const record = row as unknown as Record<string, unknown>;

          return {
            kind: source.kind,
            group: source.group,
            label: source.label(record),
            hint: source.hint(record),
            href: source.href(record),
          };
        });
      }),
    );

    const results = responses.flat().filter((hit) => hit.label);

    /*
     * Exact and starts-with hits first.
     *
     * Thirteen tables answering at once means the order they were listed
     * in decides what somebody sees, which is arbitrary. Ranking by how
     * well the label matches puts "Cafés" above a venue whose address
     * happens to contain "cafe".
     */
    const lower = term.toLowerCase();

    results.sort((a, b) => {
      const score = (label: string) => {
        const value = label.toLowerCase();
        if (value === lower) return 0;
        if (value.startsWith(lower)) return 1;
        if (value.includes(lower)) return 2;
        return 3;
      };

      return score(a.label) - score(b.label) || a.label.localeCompare(b.label);
    });

    return NextResponse.json({ results: results.slice(0, 30) });
  } catch (error) {
    return failed(error, "Search failed.");
  }
}
