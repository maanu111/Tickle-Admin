import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Read any table the panel is allowed to read, with the service role.
 *
 * Once RLS is on, every one of these tables answers a signed-in admin with
 * their own rows and nothing else — which for a moderation panel means six
 * pages that render empty. The panel is not a member; it needs to see across
 * everyone, and that is exactly what the service role is for.
 *
 * This is a read hatch, not a general query endpoint. Three things keep it
 * from becoming one:
 *
 *   1. An allowlist of tables. Nothing outside it is reachable, so adding a
 *      table to the database does not silently expose it here.
 *   2. Reads only. No insert, update or delete — those live in the specific
 *      routes that know what they are doing and can log it.
 *   3. requireAdmin on every call, same as everywhere else.
 *
 * Without the allowlist this would be a way to read auth.users through a
 * query parameter, which is the sort of endpoint that ends up in a
 * post-mortem.
 */

const READABLE = new Set([
  "profiles",
  "likes",
  "passes",
  "matches",
  "messages",
  "nearby_encounters",
  "reports",
  "hearts",
  "random_matches",
  "places",
  "notifications",
  "broadcasts",
  "auth_events",
  "user_devices",
  // Listing the other admins. RLS scopes this table to your own row, which
  // is right for AuthGuard and wrong for the Access page.
  "admin_profiles",
  "compat_dimensions",
  "compat_answers",
  "compat_scores",
  "discovery_pools",
  "discovery_pool_state",
  "dailies",
  "super_likes",
  "profile_comments",
  "rose_ledger",
  "plans",
  "fairness_settings",
  "face_check_log",
  "professions",
  "profile_field_groups",
  "profile_fields",
  "profile_field_options",
  "profile_prompts",
  // Signals behind the ranker. Read-only, but invisible was worse:
  // an unexplainable deck is one nobody can debug.
  "exposure",
  "shown_pairs",
  "daily_reactions",
  "heart_settings",
  "match_revivals",
  "blocks",
  "retention_options",
  "glimpse_options",
  "capture_events",
  "message_reactions",
  "safety_rules",
  "link_blocklist",
  "safety_flags",
  "typing_state",
  "incognito_reveals",
  "platform_hearts",
  "platform_heart_claims",
  "paths_interactions",
  "sensitive_categories",
  "venue_categories",
  "blocked_venues",
  "rose_packs",
  "rose_promotions",
  "premium_plans",
  "premium_offers",
  "date_plans",
  "filter_groups",
  "filter_definitions",
  "user_filters",
  "safe_dates",
  "double_dates",
  "referral_milestones",
  "referral_awards",
  "promo_codes",
  "cities",
  "city_missions",
  "notification_categories",
  "report_reasons",
  "content_policy",
  "content_flags",
  "support_tickets",
  "support_messages",
  "admin_audit",
  "admin_roles",
  "admin_permissions",
  "role_permissions",
  "admin_alerts",
  "alert_events",
  "purchase_attempts",
  "retention_policy",
  "config_history",
]);

/** A ceiling, so a missing limit cannot pull a million rows into a browser. */
const MAX_LIMIT = 5000;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const params = new URL(request.url).searchParams;
    const table = params.get("table");

    if (!table || !READABLE.has(table)) {
      return NextResponse.json({ error: "That table is not readable here." }, { status: 400 });
    }

    const columns = params.get("select") ?? "*";
    const orderBy = params.get("order");
    const ascending = params.get("ascending") === "true";
    const limit = Math.min(Number(params.get("limit") ?? 1000) || 1000, MAX_LIMIT);

    // Column lists are passed through to PostgREST, which parses them
    // itself and rejects anything that is not a column — so a crafted
    // "select" cannot become a subquery.
    let query = auth.supabase.from(table).select(columns).limit(limit);

    /*
     * Staff are not members.
     *
     * Anybody who signs into this panel gets an auth user, and the
     * signup trigger gives every auth user a profile row — so admins
     * turned up in Members as half-empty profiles with no name, no age
     * and no gender. They are not people who signed up for the app, and
     * counting them inflates every total on the page.
     *
     * Filtered here rather than in the page so it holds for every
     * caller and for the counts, not just the one list somebody
     * remembered to fix.
     */
    if (table === "profiles") {
      const { data: staff } = await auth.supabase.from("admin_profiles").select("id");
      const ids = (staff ?? []).map((row) => (row as { id: string }).id);

      if (ids.length > 0) {
        query = query.not("user_id", "in", `(${ids.join(",")})`);
      }
    }

    if (orderBy) query = query.order(orderBy, { ascending });

    // One optional equality filter, which is all the panel's pages need.
    const eqColumn = params.get("eq");
    const eqValue = params.get("value");
    if (eqColumn && eqValue !== null) query = query.eq(eqColumn, eqValue);

    const inColumn = params.get("in");
    const inValues = params.get("values");
    if (inColumn && inValues) query = query.in(inColumn, inValues.split(", "));

    // "greater than", for the live-stories window and anything else with an
    // expiry. Only one, and only this comparison — the panel has never
    // needed more, and every operator added here is more surface.
    const gtColumn = params.get("gt");
    const gtValue = params.get("gtValue");
    if (gtColumn && gtValue !== null) query = query.gt(gtColumn, gtValue);

    const { data, error, count } = await query;

    if (error) throw error;

    return NextResponse.json({ rows: data ?? [], count: count ?? (data?.length ?? 0) });
  } catch (error) {
    return failed(error, "Failed to read that table.");
  }
}

/**
 * Row counts, without pulling the rows.
 *
 * The Pulse page wants six totals and nothing else; fetching every row to
 * call .length on it is how a dashboard becomes the slowest page in a panel.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as {
      tables?: (string | { table: string; gt?: [string, string] })[];
    };

    const wanted = (body.tables ?? []).map((entry) =>
      typeof entry === "string" ? { table: entry } : entry,
    );
    const tables = wanted.filter((entry) => READABLE.has(entry.table));

    if (tables.length === 0) {
      return NextResponse.json({ error: "No readable tables named." }, { status: 400 });
    }

    const results = await Promise.all(
      tables.map(async (entry) => {
        let query = auth.supabase.from(entry.table).select("*", { count: "exact", head: true });

        // Same exclusion as the row query above: a member count that
        // includes staff is wrong everywhere it is shown.
        if (entry.table === "profiles") {
          const { data: staff } = await auth.supabase.from("admin_profiles").select("id");
          const ids = (staff ?? []).map((row) => (row as { id: string }).id);
          if (ids.length > 0) query = query.not("user_id", "in", `(${ids.join(",")})`);
        }

        // Lets "live stories" be a count rather than a fetch-and-length.
        if (entry.gt) query = query.gt(entry.gt[0], entry.gt[1]);

        const { count } = await query;
        return [entry.table, count ?? 0] as const;
      }),
    );

    return NextResponse.json({ counts: Object.fromEntries(results) });
  } catch (error) {
    return failed(error, "Failed to count.");
  }
}
