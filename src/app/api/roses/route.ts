import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";
import { NAME_COLUMNS, nameByUserId, type NamedProfile } from "@/lib/supabase/names";

/**
 * Roses — the whole subject, in one route.
 *
 * Roses are the in-app currency, and until now the numbers that govern
 * them were scattered across six screens: packs on /plans, drop and
 * extend costs on /hearts, the revival price and the media-save split in
 * fairness settings, referral and mission
 * rewards on two more. Every one of those is the same decision — how
 * many roses come in, and what they buy — and no screen showed enough of
 * it to make that decision.
 *
 * So the fields moved here rather than being mirrored here. A setting
 * editable in two places is a setting with two answers.
 *
 * Roses are bought with real money, so two things follow: support has to
 * be able to make somebody whole after a failed purchase, and every
 * movement has to stay attributable afterwards. Hence the ledger, and
 * hence grants being capped and reason-tagged.
 *
 * Not to be confused with Hearts, which are the things left at venues.
 */

/**
 * Every rose number the panel can change, and where it lives.
 *
 * A map rather than a chain of ifs: the table a field belongs to is data,
 * and anything absent is unwritable — which is what keeps this from
 * becoming a general update endpoint for six tables.
 */
type Target = {
  table: string;
  /** How the row is found. Settings tables are a single row with id = 1. */
  by: "singleton" | "key" | "slug" | "id";
  min: number;
  max: number;
};

const FIELDS: Record<string, Target> = {
  // fairness_settings — one row, id 1.
  revival_cost: { table: "fairness_settings", by: "singleton", min: 0, max: 500 },
  revival_step: { table: "fairness_settings", by: "singleton", min: 0, max: 500 },
  revival_max: { table: "fairness_settings", by: "singleton", min: 0, max: 20 },
  save_price_min: { table: "fairness_settings", by: "singleton", min: 1, max: 10000 },
  save_price_max: { table: "fairness_settings", by: "singleton", min: 1, max: 100000 },
  save_sender_share: { table: "fairness_settings", by: "singleton", min: 0, max: 100 },

  // heart_settings — one row, id 1.
  free_drops_per_day: { table: "heart_settings", by: "singleton", min: 0, max: 50 },
  extra_drop_cost: { table: "heart_settings", by: "singleton", min: 0, max: 500 },
  extend_rose_cost: { table: "heart_settings", by: "singleton", min: 0, max: 500 },

  // plans — per plan key, so free and premium can differ.
  signup_roses: { table: "plans", by: "key", min: 0, max: 1000 },
  super_like_rose_cost: { table: "plans", by: "key", min: 0, max: 500 },


  // rose_packs — per row.
  amount: { table: "rose_packs", by: "id", min: 1, max: 100000 },
  bonus: { table: "rose_packs", by: "id", min: 0, max: 100000 },
  price_minor: { table: "rose_packs", by: "id", min: 0, max: 10000000 },
  premium_bonus: { table: "rose_packs", by: "id", min: 0, max: 100000 },

  // Reward sizes on the two tables that hand roses out for doing something.
  reward_value: { table: "", by: "id", min: 1, max: 10000 },
};

/** Tables `reward_value` may be written on, since the field name repeats. */
const REWARD_TABLES = new Set(["referral_milestones", "city_missions", "platform_hearts"]);

/** Rows an admin may retire or restore from this page. */
const TOGGLEABLE = new Set([
  "rose_packs",
  "rose_promotions",
  "referral_milestones",
  "city_missions",
  "promo_codes",
]);

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { supabase } = auth;
    const userId = new URL(request.url).searchParams.get("user_id");

    // One person's ledger, for a support conversation about their balance.
    if (userId) {
      const [profileRes, ledgerRes] = await Promise.all([
        supabase.from("profiles").select("user_id, name, roses").eq("user_id", userId).single(),
        supabase
          .from("rose_ledger")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      if (profileRes.error) throw profileRes.error;

      return NextResponse.json({
        profile: profileRes.data,
        ledger: ledgerRes.data ?? [],
      });
    }

    const [
      ledgerRes,
      recentRes,
      superRes,
      balanceRes,
      packsRes,
      promosRes,
      plansRes,
      fairnessRes,
      heartsRes,
      milestonesRes,
      missionsRes,
      codesRes,
      attemptsRes,
    ] = await Promise.all([
      // Amount and reason only, over the whole history — this is the
      // aggregate, and pulling bodies for it would be pulling 50,000 rows
      // to add up two columns.
      supabase.from("rose_ledger").select("amount, reason").limit(50000),
      supabase
        .from("rose_ledger")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("super_likes").select("paid_with, note").limit(50000),
      supabase.from("profiles").select("user_id, roses").limit(50000),
      supabase.from("rose_packs").select("*").order("sort_order"),
      supabase.from("rose_promotions").select("*").order("created_at", { ascending: false }),
      supabase.from("plans").select("key, label, signup_roses, super_like_rose_cost").order("key"),
      supabase.from("fairness_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("heart_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("referral_milestones").select("*").order("sort_order"),
      supabase.from("city_missions").select("*").order("city_slug"),
      supabase.from("promo_codes").select("*").order("created_at", { ascending: false }),
      supabase
        .from("purchase_attempts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (ledgerRes.error) throw ledgerRes.error;

    const ledger = (ledgerRes.data ?? []) as { amount: number; reason: string }[];
    const supers = (superRes.data ?? []) as { paid_with: string; note: string | null }[];
    const balances = (balanceRes.data ?? []) as { user_id: string; roses: number }[];

    const byReason: Record<string, { count: number; total: number }> = {};
    for (const row of ledger) {
      const entry = byReason[row.reason] ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += row.amount;
      byReason[row.reason] = entry;
    }

    /*
     * Bought against handed out.
     *
     * The ratio is the number that matters: a currency where almost
     * nothing is bought is one people are earning faster than they can
     * spend, and no amount of tuning a single pack fixes that.
     */
    const purchased = ledger
      .filter((row) => row.reason === "purchase" || row.reason === "pack_bonus")
      .reduce((sum, row) => sum + row.amount, 0);

    const granted = ledger
      .filter(
        (row) =>
          row.amount > 0 && row.reason !== "purchase" && row.reason !== "pack_bonus",
      )
      .reduce((sum, row) => sum + row.amount, 0);

    const spent = ledger
      .filter((row) => row.amount < 0)
      .reduce((sum, row) => sum + Math.abs(row.amount), 0);

    const circulating = balances.reduce((sum, row) => sum + (row.roses ?? 0), 0);

    const holders = [...balances]
      .filter((row) => (row.roses ?? 0) > 0)
      .sort((a, b) => b.roses - a.roses)
      .slice(0, 10);

    // Names for the ledger and the top holders, in one pass. Neither list
    // is any use as a column of uuids.
    const recent = (recentRes.data ?? []) as {
      user_id: string;
      target_id: string | null;
    }[];

    const ids = [
      ...new Set([
        ...recent.map((row) => row.user_id),
        ...recent.map((row) => row.target_id).filter(Boolean),
        ...holders.map((row) => row.user_id),
      ]),
    ] as string[];

    const { data: profileData } = ids.length
      ? await supabase.from("profiles").select(NAME_COLUMNS).in("user_id", ids)
      : { data: [] as NamedProfile[] };

    const names = await nameByUserId(
      supabase,
      ids,
      (profileData ?? []) as unknown as NamedProfile[],
    );

    return NextResponse.json({
      totals: {
        movements: ledger.length,
        purchased,
        granted,
        spent,
        circulating,
      },
      byReason,
      superLikes: {
        total: supers.length,
        paidWithRoses: supers.filter((row) => row.paid_with === "roses").length,
        // Whether the note is worth having: a Super Like with a sentence
        // is a different product from one without.
        withNote: supers.filter((row) => (row.note ?? "").trim().length > 0).length,
      },
      holders: holders.map((row) => ({ ...row, name: names.get(row.user_id) ?? "" })),
      recent: recent.map((row) => ({
        ...row,
        name: names.get(row.user_id) ?? "",
        target: row.target_id ? (names.get(row.target_id) ?? "") : null,
      })),
      packs: packsRes.data ?? [],
      promotions: promosRes.data ?? [],
      plans: plansRes.data ?? [],
      fairness: fairnessRes.data ?? null,
      heartSettings: heartsRes.data ?? null,
      milestones: milestonesRes.data ?? [],
      missions: missionsRes.data ?? [],
      codes: codesRes.data ?? [],
      attempts: attemptsRes.data ?? [],
    });
  } catch (error) {
    return failed(error, "Failed to load rose data.");
  }
}

/**
 * Change one rose number.
 *
 * The body says which field and, where the table has more than one row,
 * which row: `{ field, value, key }` for a plan, `{ field, value, slug }`
 * for a city, `{ field, value, id, table }` for a pack or a reward.
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "config.economy");
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;

    // Retiring a row rather than changing a number.
    if (typeof body.active === "boolean" && typeof body.table === "string") {
      if (!TOGGLEABLE.has(body.table)) {
        return NextResponse.json({ error: "That cannot be retired here." }, { status: 400 });
      }

      const { error } = await auth.supabase
        .from(body.table)
        .update({ active: body.active })
        .eq("id", String(body.id ?? ""));

      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    const field = String(body.field ?? "");
    const target = FIELDS[field];

    if (!target) {
      return NextResponse.json({ error: "That field is not editable here." }, { status: 400 });
    }

    const value = Number(body.value);

    if (!Number.isFinite(value) || value < target.min || value > target.max) {
      return NextResponse.json(
        { error: `${field} must be between ${target.min} and ${target.max}.` },
        { status: 400 },
      );
    }

    // `reward_value` exists on three tables, so the caller names the one it
    // means and the set above decides whether that is allowed.
    let table = target.table;

    if (!table) {
      table = String(body.table ?? "");
      if (!REWARD_TABLES.has(table)) {
        return NextResponse.json({ error: "Unknown reward." }, { status: 400 });
      }
    }

    const update = { [field]: Math.round(value) };
    let query = auth.supabase.from(table).update(update);

    if (target.by === "singleton") query = query.eq("id", 1);
    else if (target.by === "key") query = query.eq("key", String(body.key ?? ""));
    else if (target.by === "slug") query = query.eq("slug", String(body.slug ?? ""));
    else query = query.eq("id", String(body.id ?? ""));

    const { error } = await query;
    if (error) throw error;

    /*
     * The floor cannot end up above the ceiling. Checked after the write
     * rather than before because either field can be the one moving, and
     * reading the row first would still race the other admin editing it.
     */
    if (field === "save_price_min" || field === "save_price_max") {
      const { data } = await auth.supabase
        .from("fairness_settings")
        .select("save_price_min, save_price_max")
        .eq("id", 1)
        .maybeSingle();

      const row = data as { save_price_min: number; save_price_max: number } | null;

      if (row && row.save_price_min > row.save_price_max) {
        return NextResponse.json(
          { error: "Saved: but the minimum now exceeds the maximum. Fix the other one." },
          { status: 409 },
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to update that setting.");
  }
}

/** Grant or take back roses for one member, always through the audited RPC. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "adjust.hearts");
    if (auth.error) return auth.error;

    const body = (await request.json()) as { user_id?: string; amount?: number };

    if (!body.user_id || !Number.isFinite(Number(body.amount)) || Number(body.amount) === 0) {
      return NextResponse.json(
        { error: "A user and a non-zero amount are required." },
        { status: 400 },
      );
    }

    const amount = Math.round(Number(body.amount));

    // A cap on a single grant. Not because a larger one is never right, but
    // because a mistyped zero should not become a thousand roses.
    if (Math.abs(amount) > 500) {
      return NextResponse.json(
        { error: "Grants are capped at 500 at a time." },
        { status: 400 },
      );
    }

    const { data, error } = await auth.supabase.rpc("admin_grant_roses", {
      p_user_id: body.user_id,
      p_amount: amount,
    });

    if (error) throw error;

    return NextResponse.json({ balance: data });
  } catch (error) {
    return failed(error, "Failed to move roses.");
  }
}
