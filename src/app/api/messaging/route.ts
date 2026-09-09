import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * The messaging levers.
 *
 * Retention durations, Glimpse lengths, the price range a sender may
 * charge to save media, and the platform's cut. All of it is spec'd as
 * "dynamically configured", which means it belongs here rather than in
 * a constant somebody has to ship a build to change.
 *
 * Message *content* is deliberately absent. An admin panel that can read
 * disappearing messages is a panel that has undone the feature — the
 * counts below are aggregates only, and there is no route that returns
 * a message body.
 */

const SETTINGS: Record<string, { min: number; max: number }> = {
  save_price_min: { min: 0, max: 1000 },
  save_price_max: { min: 1, max: 5000 },
  // The sender's percentage of a save. The platform keeps the rest.
  save_sender_share: { min: 0, max: 100 },
  voice_max_seconds: { min: 10, max: 600 },
  // Minutes, converted to an interval on the way in. Zero switches the
  // action off rather than making it unlimited.
  edit_window_minutes: { min: 0, max: 120 },
  /*
   * Unsending gets a wider ceiling than editing — a day rather than two
   * hours.
   *
   * They are different acts. Editing fixes a typo, which is noticed at
   * once; unsending is for something that should not have been sent,
   * which is often realised much later.
   */
  unsend_window_minutes: { min: 0, max: 1440 },
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const [settings, retention, glimpse, volume, saves] = await Promise.all([
      auth.supabase.from("fairness_settings").select("*").eq("id", 1).single(),
      auth.supabase.from("retention_options").select("*").order("sort_order"),
      auth.supabase.from("glimpse_options").select("*").order("sort_order"),
      // Kind and timing only — never content.
      auth.supabase.from("messages").select("kind, created_at, saved_at").limit(50000),
      auth.supabase.from("capture_events").select("kind, created_at").limit(10000),
    ]);

    if (settings.error) throw settings.error;

    const rows = (volume.data ?? []) as { kind: string; saved_at: string | null }[];

    const byKind: Record<string, number> = {};
    for (const row of rows) {
      byKind[row.kind] = (byKind[row.kind] ?? 0) + 1;
    }

    return NextResponse.json({
      settings: settings.data,
      retention: retention.data ?? [],
      glimpse: glimpse.data ?? [],
      volume: {
        total: rows.length,
        byKind,
        // How often the paid-save path is actually used. If this is near
        // zero the price is wrong, not the feature.
        saved: rows.filter((row) => row.saved_at !== null).length,
      },
      captures: (saves.data ?? []).length,
    });
  } catch (error) {
    return failed(error, "Failed to load messaging settings.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;
    const update: Record<string, unknown> = {};

    for (const [key, limits] of Object.entries(SETTINGS)) {
      if (!(key in body)) continue;

      const value = Number(body[key]);
      if (!Number.isFinite(value) || value < limits.min || value > limits.max) {
        return NextResponse.json(
          { error: `${key} must be between ${limits.min} and ${limits.max}.` },
          { status: 400 },
        );
      }

      if (key === "edit_window_minutes") {
        update.edit_window = `${Math.round(value)} minutes`;
      } else if (key === "unsend_window_minutes") {
        update.unsend_window = `${Math.round(value)} minutes`;
      } else {
        update[key] = Math.round(value);
      }
    }

    // A minimum above the maximum would leave senders unable to price
    // anything at all, and the failure would look like a broken button.
    const min = Number(update.save_price_min ?? body.save_price_min);
    const max = Number(update.save_price_max ?? body.save_price_max);

    if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
      return NextResponse.json(
        { error: "Minimum save price cannot exceed the maximum." },
        { status: 400 },
      );
    }

    if (typeof body.default_retention === "string") {
      const { data: option } = await auth.supabase
        .from("retention_options")
        .select("key")
        .eq("key", body.default_retention)
        .eq("active", true)
        .maybeSingle();

      if (!option) {
        return NextResponse.json(
          { error: "That retention option does not exist or is retired." },
          { status: 400 },
        );
      }

      update.default_retention = body.default_retention;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    }

    const { error } = await auth.supabase
      .from("fairness_settings")
      .update(update)
      .eq("id", 1);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to update messaging settings.");
  }
}

/** Add or retire a retention option. Retiring never touches sent messages. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;

    if (body.entity === "retention") {
      const key = String(body.key ?? "").trim();
      const label = String(body.label ?? "").trim();

      if (!key || !label) {
        return NextResponse.json({ error: "Key and label are required." }, { status: 400 });
      }

      /*
       * A retention option is either a duration or a view budget, never
       * both and never neither — the table has a CHECK saying so, and
       * rejecting it here gives a better message than the constraint.
       */
      const hours = body.hours == null ? null : Number(body.hours);
      const views = body.views == null ? null : Number(body.views);

      if ((hours == null) === (views == null)) {
        return NextResponse.json(
          { error: "Give either a duration in hours or a view count, not both." },
          { status: 400 },
        );
      }

      const { data, error } = await auth.supabase
        .from("retention_options")
        .insert({
          key,
          label,
          duration: hours == null ? null : `${hours} hours`,
          view_budget: views == null ? null : Math.round(views),
          sort_order: Number(body.sort_order ?? 999),
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          return NextResponse.json({ error: "That key already exists." }, { status: 409 });
        }
        throw error;
      }

      return NextResponse.json({ row: data });
    }

    if (body.entity === "glimpse") {
      const ms = Number(body.ms);

      if (!Number.isFinite(ms) || ms < 50 || ms > 5000) {
        return NextResponse.json(
          { error: "A Glimpse must be between 50 and 5000 milliseconds." },
          { status: 400 },
        );
      }

      const { data, error } = await auth.supabase
        .from("glimpse_options")
        .insert({
          ms: Math.round(ms),
          label: String(body.label ?? `${(ms / 1000).toFixed(2)}s`),
          sort_order: Number(body.sort_order ?? 999),
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          return NextResponse.json({ error: "That duration already exists." }, { status: 409 });
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

/** Retire, never delete: an option a message was sent under must survive. */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const entity = searchParams.get("entity") ?? "";
    const id = searchParams.get("id") ?? "";

    const table =
      entity === "retention"
        ? "retention_options"
        : entity === "glimpse"
          ? "glimpse_options"
          : null;

    if (!table || !id) {
      return NextResponse.json({ error: "Unknown option." }, { status: 400 });
    }

    const { error } = await auth.supabase.from(table).update({ active: false }).eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to retire that option.");
  }
}
