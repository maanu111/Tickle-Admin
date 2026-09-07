import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Promo codes and referral milestones.
 *
 * Two things that look alike and are not: a promo code is handed out,
 * and a referral milestone is earned. They share this route because
 * they share a failure mode — a campaign with no cap is an open-ended
 * cost, and the person who created it is not the one who notices.
 *
 * The redemption counts are shown beside every code for that reason.
 */

const REWARD_KINDS = [
  "roses",
  "super_likes",
  "premium_days",
  "premium_discount",
  "pack_bonus",
];

/*
 * What an invite reward can pay, which is a shorter list.
 *
 * Promo codes and milestones were sharing REWARD_KINDS, and they do not
 * share crediting code. award_referral() only has branches for roses and
 * premium_days — picking anything else recorded the award and sent a
 * notification saying the reward was in their wallet, while crediting
 * nothing. 'super_likes' is not an oversight there: super likes are
 * bought with roses rather than held as a balance, so there is no
 * balance to add to.
 */
const MILESTONE_KINDS = ["roses", "premium_days"];

const SEGMENTS = ["new", "premium", "free", "lapsed"];

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const [codes, milestones, awards, redemptions, cities, caps] = await Promise.all([
      auth.supabase.from("promo_codes").select("*").order("created_at", { ascending: false }),
      auth.supabase.from("referral_milestones").select("*").order("sort_order"),
      auth.supabase.from("referral_awards").select("milestone, referrer_id").limit(50000),
      auth.supabase.from("promo_redemptions").select("promo_id").limit(50000),
      /*
       * The cities people are actually in.
       *
       * This read the `cities` table, which held six metros somebody
       * seeded once — and not one member is in any of them. A code
       * scoped from that list would have reached nobody, while the
       * places members really are (Mohali, Zirakpur, Kharar) were not
       * offered at all.
       *
       * redeem_promo() compares promo_codes.city to profiles.city as
       * lowercase text and never consults the cities table, so this is
       * also the only list that matches how a code is actually applied.
       */
      auth.supabase
        .from("profiles")
        .select("city")
        .not("city", "is", null)
        .limit(50000),
      auth.supabase
        .from("fairness_settings")
        .select("referral_daily_cap, referral_total_cap")
        .eq("id", 1)
        .maybeSingle(),
    ]);

    if (codes.error) throw codes.error;

    const perMilestone: Record<string, number> = {};
    const referrers = new Set<string>();

    for (const row of (awards.data ?? []) as { milestone: string; referrer_id: string }[]) {
      perMilestone[row.milestone] = (perMilestone[row.milestone] ?? 0) + 1;
      referrers.add(row.referrer_id);
    }

    return NextResponse.json({
      codes: codes.data ?? [],
      milestones: milestones.data ?? [],
      rewardKinds: REWARD_KINDS,
      milestoneKinds: MILESTONE_KINDS,
      // What the anti-farm ceiling is set to. Shown beside the rewards
      // because it is the reason a reward can look correct and still
      // not pay: past this many, awards stop silently by design.
      referralCaps: caps.data ?? null,
      /*
       * Offered as a list so a code cannot be scoped to a city that
       * does not exist. Launched ones first: those are the ones a
       * campaign is almost always for.
       *
       * The column is `status`, not `live`. Selecting a column that is
       * not there fails the whole query — which is why this arrived
       * empty and the city dropdown had nothing in it.
       */
      /*
       * Busiest first, with the member count on each.
       *
       * A campaign is worth running where people are, so the ordering
       * is by how many members are there rather than alphabetical — and
       * the count travels with it so the number is visible at the point
       * the choice is made.
       */
      cities: Object.entries(
        ((cities.data ?? []) as { city: string | null }[]).reduce<Record<string, number>>(
          (tally, row) => {
            const name = (row.city ?? "").trim();
            if (name) tally[name] = (tally[name] ?? 0) + 1;
            return tally;
          },
          {},
        ),
      )
        .map(([name, people]) => ({ slug: name.toLowerCase(), name, people }))
        .sort((a, b) => b.people - a.people || a.name.localeCompare(b.name)),
      segments: SEGMENTS,
      referral: {
        awarded: (awards.data ?? []).length,
        // People who have successfully brought somebody in. The ratio of
        // this to total awards says whether referrals are broad or a
        // handful of accounts doing something odd.
        referrers: referrers.size,
        perMilestone,
      },
      totalRedemptions: (redemptions.data ?? []).length,
    });
  } catch (error) {
    return failed(error, "Failed to load promotions.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "config.campaigns");
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;

    const code = String(body.code ?? "").trim().toUpperCase();
    const label = String(body.label ?? "").trim();
    const kind = String(body.reward_kind ?? "");
    const value = Number(body.reward_value ?? 0);

    if (code.length < 3 || label.length < 3) {
      return NextResponse.json(
        { error: "A code needs at least three characters and a label." },
        { status: 400 },
      );
    }

    if (!REWARD_KINDS.includes(kind)) {
      return NextResponse.json({ error: "Unknown reward kind." }, { status: 400 });
    }

    if (!Number.isFinite(value) || value < 1 || value > 100000) {
      return NextResponse.json({ error: "Value must be between 1 and 100000." }, { status: 400 });
    }

    const segment = body.segment ? String(body.segment) : null;
    if (segment && !SEGMENTS.includes(segment)) {
      return NextResponse.json({ error: "Unknown segment." }, { status: 400 });
    }

    const days = body.days == null ? null : Number(body.days);

    const { data, error } = await auth.supabase
      .from("promo_codes")
      .insert({
        code,
        label,
        reward_kind: kind,
        reward_value: Math.round(value),
        city: body.city ? String(body.city).trim().toLowerCase() : null,
        segment,
        max_uses: body.max_uses == null ? null : Math.round(Number(body.max_uses)),
        ends_at:
          days && Number.isFinite(days)
            ? new Date(Date.now() + days * 86_400_000).toISOString()
            : null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "That code already exists." }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ code: data });
  } catch (error) {
    return failed(error, "Failed to create that code.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "config.campaigns");
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;
    const id = String(body.id ?? "");

    if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

    const isMilestone = body.entity === "milestone";
    const table = isMilestone ? "referral_milestones" : "promo_codes";

    const update: Record<string, unknown> = {};

    if (typeof body.active === "boolean") update.active = body.active;

    if ("reward_value" in body) {
      const value = Number(body.reward_value);
      if (!Number.isFinite(value) || value < 1 || value > 100000) {
        return NextResponse.json({ error: "Value is out of range." }, { status: 400 });
      }
      update.reward_value = Math.round(value);
    }

    /*
     * What kind of reward, not just how much.
     *
     * Checked against the list rather than passed through: reward_kind
     * is read by the crediting function, and an unrecognised value
     * there is a reward that silently never pays. Milestones get the
     * shorter list — see MILESTONE_KINDS.
     */
    if ("reward_kind" in body) {
      const kind = String(body.reward_kind);
      const allowed = isMilestone ? MILESTONE_KINDS : REWARD_KINDS;
      if (!allowed.includes(kind)) {
        return NextResponse.json({ error: "Unknown reward." }, { status: 400 });
      }
      update.reward_kind = kind;
    }

    /*
     * The wording members read.
     *
     * Editable because these are sentences shown in the app — "They
     * joined" is a choice about tone, not a database key. The key
     * itself is never editable: it is what the crediting code matches
     * on, and renaming it would stop the reward paying.
     */
    if (typeof body.label === "string") {
      const label = body.label.trim();
      if (label.length < 2) {
        return NextResponse.json({ error: "That needs a name." }, { status: 400 });
      }
      update.label = label;
    }

    if (isMilestone) {
      /*
       * Who gets paid.
       *
       * Both can be on — that is a referral that thanks the inviter and
       * welcomes the new person. Neither cannot: a milestone paying
       * nobody still writes an award row and still sends a notification
       * promising a reward, so it reads as working while doing nothing.
       * The same check exists as a table constraint; this one is here
       * to give a sentence back instead of a Postgres error string.
       */
      if (typeof body.rewards_referrer === "boolean") {
        update.rewards_referrer = body.rewards_referrer;
      }
      if (typeof body.rewards_invitee === "boolean") {
        update.rewards_invitee = body.rewards_invitee;
      }

      const referrer = update.rewards_referrer ?? body.current_rewards_referrer;
      const invitee = update.rewards_invitee ?? body.current_rewards_invitee;

      if (referrer === false && invitee === false) {
        return NextResponse.json(
          { error: "A reward has to pay somebody — pick the inviter, the new member, or both." },
          { status: 400 },
        );
      }

      // Shown to the invited person, who is not "they". Cleared back to
      // null rather than empty string so the payout falls back to label.
      if (typeof body.invitee_label === "string") {
        update.invitee_label = body.invitee_label.trim() || null;
      }

      if ("sort_order" in body) {
        const order = Number(body.sort_order);
        if (!Number.isFinite(order) || order < 0 || order > 10000) {
          return NextResponse.json({ error: "Order is out of range." }, { status: 400 });
        }
        update.sort_order = Math.round(order);
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    }

    const { error } = await auth.supabase.from(table).update(update).eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to update.");
  }
}
