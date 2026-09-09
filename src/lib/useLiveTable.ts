"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Reload when a table changes, without polling.
 *
 * Every page here loaded once on mount and then sat there. A member
 * signing up, a report arriving, a ticket being answered — none of it
 * showed until somebody pressed refresh, which meant the panel was
 * usually describing a database that had moved on.
 *
 * This subscribes to Postgres changes and calls the same loader the
 * page already has. It deliberately re-runs the whole load rather than
 * patching the changed row into local state: the loaders here join,
 * count and aggregate, and a page that reconstructs those by hand from
 * a change payload drifts from the query it is supposed to mirror.
 *
 * Reads go through the panel's own routes with the service role, so a
 * table invisible to the anon key still loads correctly — this only
 * needs to know that *something* changed, not what.
 *
 * Note the tables must be added to the `supabase_realtime` publication
 * or nothing arrives. Migration 058 does that.
 */
export function useLiveTable(
  tables: string | string[],
  load: () => void | Promise<unknown>,
  /** Off while a modal is open, say, so a reload cannot pull the ground out. */
  enabled = true,
) {
  /*
   * The loader lives in a ref so a page can pass an inline function
   * without tearing the subscription down and rebuilding it on every
   * render — which would drop events in the gap.
   *
   * The write happens in an effect, not during render. A render can be
   * started and thrown away, and under StrictMode every render runs
   * twice; assigning here during render would let a discarded pass
   * leave its loader behind, so a change event would reload using the
   * filter state of a render that never committed.
   */
  const loadRef = useRef(load);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  const list = Array.isArray(tables) ? tables : [tables];
  const key = list.join(",");

  useEffect(() => {
    if (!enabled) return;

    const supabase = createClient();

    /*
     * Changes arrive in bursts — a signup writes a profile, a wallet
     * row and a notification within milliseconds. Reloading per event
     * would run the page's whole query three times for one thing
     * happening, so they are coalesced into one reload.
     */
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void loadRef.current();
      }, 250);
    };

    const channel = supabase.channel(`admin:${key}:${Date.now()}`);

    for (const table of key.split(",")) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        schedule,
      );
    }

    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [key, enabled]);
}
