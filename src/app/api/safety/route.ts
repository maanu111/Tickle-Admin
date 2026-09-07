import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * The scam and link rules.
 *
 * Editable here because scam wording moves faster than releases do. A
 * new script appears, somebody reports it, and the rule that catches it
 * should exist the same afternoon.
 *
 * The GET also returns how each category is actually performing —
 * flagged versus continued. That number is the only way to tell a rule
 * that protects people from one that cries wolf: a category where almost
 * everyone presses Continue is a category warning about nothing, and it
 * costs trust in every other warning.
 */

const CATEGORIES = [
  "money",
  "crypto",
  "payment",
  "credentials",
  "threat",
  "sexual",
  "link",
  "copypaste",
];

const REASONS = ["shortener", "phishing", "scam", "adult", "other"];

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const [rules, domains, flags] = await Promise.all([
      auth.supabase.from("safety_rules").select("*").order("category"),
      auth.supabase.from("link_blocklist").select("*").order("domain"),
      // Category and outcome only. The message text is never read here —
      // a panel that can read flagged messages has undone the privacy
      // the rest of the chat promises.
      auth.supabase.from("safety_flags").select("category, outcome").limit(20000),
    ]);

    if (rules.error) throw rules.error;

    const rows = (flags.data ?? []) as { category: string; outcome: string | null }[];

    /*
     * Per category: how often it fired, and what people did.
     *
     * `continued` is the number that matters. High continue rates mean
     * the rule is wrong more often than it is right.
     */
    const performance: Record<
      string,
      { flagged: number; continued: number; reported: number; blocked: number }
    > = {};

    for (const row of rows) {
      const entry = (performance[row.category] ??= {
        flagged: 0,
        continued: 0,
        reported: 0,
        blocked: 0,
      });

      entry.flagged += 1;
      if (row.outcome === "continued") entry.continued += 1;
      if (row.outcome === "reported") entry.reported += 1;
      if (row.outcome === "blocked") entry.blocked += 1;
    }

    return NextResponse.json({
      rules: rules.data ?? [],
      domains: domains.data ?? [],
      performance,
      categories: CATEGORIES,
      reasons: REASONS,
      totalFlags: rows.length,
    });
  } catch (error) {
    return failed(error, "Failed to load safety rules.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "config.safety");
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;

    if (body.entity === "rule") {
      const category = String(body.category ?? "");
      const pattern = String(body.pattern ?? "").trim();
      const label = String(body.label ?? "").trim();
      const weight = Number(body.weight ?? 2);

      if (!CATEGORIES.includes(category)) {
        return NextResponse.json({ error: "Unknown category." }, { status: 400 });
      }

      if (pattern.length < 3 || label.length < 3) {
        return NextResponse.json(
          { error: "A rule needs a pattern and a label." },
          { status: 400 },
        );
      }

      if (![1, 2, 3].includes(weight)) {
        return NextResponse.json({ error: "Weight must be 1, 2 or 3." }, { status: 400 });
      }

      /*
       * The pattern is compiled before it is stored.
       *
       * An invalid regex would be accepted by the column and then fail
       * silently on every scan — the rule would look present and catch
       * nothing, which is the worst of both.
       */
      try {
        new RegExp(pattern, "i");
      } catch {
        return NextResponse.json(
          { error: "That pattern is not a valid regular expression." },
          { status: 400 },
        );
      }

      const { data, error } = await auth.supabase
        .from("safety_rules")
        .insert({ category, pattern, label, weight })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ row: data });
    }

    if (body.entity === "domain") {
      const domain = String(body.domain ?? "")
        .trim()
        .toLowerCase()
        // Stored bare, so a pasted URL still lands as a domain.
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/.*$/, "");

      const reason = String(body.reason ?? "other");

      if (!domain.includes(".")) {
        return NextResponse.json({ error: "That is not a domain." }, { status: 400 });
      }

      if (!REASONS.includes(reason)) {
        return NextResponse.json({ error: "Unknown reason." }, { status: 400 });
      }

      const { data, error } = await auth.supabase
        .from("link_blocklist")
        .insert({ domain, reason })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          return NextResponse.json({ error: "That domain is already listed." }, { status: 409 });
        }
        throw error;
      }

      return NextResponse.json({ row: data });
    }

    return NextResponse.json({ error: "Unknown entity." }, { status: 400 });
  } catch (error) {
    return failed(error, "Failed to add.");
  }
}

/** Retire, never delete — an existing flag references the rule that made it. */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "config.safety");
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;
    const id = String(body.id ?? "");

    const table =
      body.entity === "rule"
        ? "safety_rules"
        : body.entity === "domain"
          ? "link_blocklist"
          : null;

    if (!table || !id) {
      return NextResponse.json({ error: "Unknown target." }, { status: 400 });
    }

    const update: Record<string, unknown> = {};

    if (typeof body.active === "boolean") update.active = body.active;

    if (body.entity === "rule" && "weight" in body) {
      const weight = Number(body.weight);
      if (![1, 2, 3].includes(weight)) {
        return NextResponse.json({ error: "Weight must be 1, 2 or 3." }, { status: 400 });
      }
      update.weight = weight;
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

/**
 * Removing a rule or a blocked domain.
 *
 * These could be created and switched off, never deleted — so a rule
 * added with a typo in its pattern stayed in the list forever, greyed
 * out, alongside the corrected one. A list nobody can tidy is a list
 * people stop reading.
 *
 * Deletion is safe here in a way it is not for offers or codes: a rule
 * is matched live against new messages and leaves no rows pointing back
 * at it. Nothing loses its history when one goes.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "config.safety");
    if (auth.error) return auth.error;

    const params = new URL(request.url).searchParams;
    const id = params.get("id") ?? "";
    const entity = params.get("entity") ?? "";

    const table =
      entity === "rule"
        ? "safety_rules"
        : entity === "domain"
          ? "link_blocklist"
          : null;

    if (!table || !id) {
      return NextResponse.json({ error: "Unknown target." }, { status: 400 });
    }

    const { error } = await auth.supabase.from(table).delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to remove.");
  }
}
