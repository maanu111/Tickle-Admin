"use client";
import { useCallback, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PagedList } from "@/components/ui/paged-list";
import { Undo2, RefreshCw } from "lucide-react";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { useLiveTable } from "@/lib/useLiveTable";
import { useConfirm } from "@/components/ui/confirm";

/**
 * Every change to the settings, and a way back from any of them.
 *
 * Both values are shown, always —"match_ttl changed" tells nobody
 * anything a week later;"72 hours to 48" tells them everything, and is
 * what the undo actually writes back.
 */

type Entry = {
  id: string;
  source: string;
  row_key: string;
  changes: Record<string, { from: unknown; to: unknown }>;
  admin_email: string | null;
  reason: string | null;
  reverted_from: string | null;
  created_at: string;
};

const SOURCE_LABELS: Record<string, string> = {
  fairness_settings: "Rules",
  heart_settings: "Heart Hunt",
  plans: "Plans",
};

/** Intervals and numbers, shown the way they are stored. */
function show(value: unknown): string {
  if (value === null || value === undefined) return "not set";
  if (typeof value === "boolean") return value ? "on" : "off";
  return String(value);
}

export function ConfigHistory() {
  const confirm = useConfirm();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    const { data, error } = await adminFetch<{ history: Entry[] }>(
      "/api/config-history",
    );

    if (error) setError(error);
    else {
      setEntries(data?.history ?? []);
      setError(null);
    }

    setLoading(false);
  }, []);

  useLoadOnMount(load);

  // Two admins changing settings at once should each see the other's
  // entry appear, rather than both editing against a history that stops
  // at the moment they opened the page.
  useLiveTable("config_history", load);

  const undo = useCallback(
    async (entry: Entry) => {
      const summary = Object.entries(entry.changes)
        .map(([k, v]) => `${k} back to ${show(v.from)}`)
        .join(", ");

      const ok = await confirm({
        title: "Roll this setting back?",
        body: `This will put ${summary}.`,
        confirmLabel: "Roll back",
      });
      if (!ok) return;

      setBusy(entry.id);
      setError(null);

      const { error } = await adminFetch("/api/config-history", {
        method: "POST",
        body: JSON.stringify({ entry_id: entry.id }),
      });

      if (error) setError(error);
      else await load();

      setBusy(null);
    },
    [load, confirm],
  );

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="mt-1 text-[0.92rem] text-muted-foreground">
            Every edit to these settings, including any made outside this panel.
          </p>
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={load}
          disabled={loading}
          className="border-foreground/[0.06]"
        >
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </div>

      {error && <p className="text-[0.92rem] text-destructive">{error}</p>}

      {entries.length === 0 && !loading && (
        <p className="border border-foreground/[0.06] p-6 text-[0.92rem] text-muted-foreground">
          Nothing has been changed yet.
        </p>
      )}

      <PagedList
        items={entries}
        className="divide-y divide-border/50 border border-foreground/[0.06]"
      >
        {(entry) => (
          <div key={entry.id} className="flex flex-wrap gap-4 p-4">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[0.86rem] text-muted-foreground">
                <Badge variant="secondary">
                  {SOURCE_LABELS[entry.source] ?? entry.source}
                  {entry.source === "plans" && ` · ${entry.row_key}`}
                </Badge>

                <span>{new Date(entry.created_at).toLocaleString()}</span>

                {/* An unattributed change came from SQL, not the panel.
                    Worth seeing rather than smoothing over. */}
                <span>
                  {entry.admin_email ?? (
                    <span className="text-amber-600">
                      changed outside the panel
                    </span>
                  )}
                </span>

                {entry.reverted_from && (
                  <Badge variant="outline">an undo</Badge>
                )}
              </div>

              <div className="space-y-1">
                {Object.entries(entry.changes).map(([key, value]) => (
                  <p key={key} className="font-mono text-[0.86rem]">
                    <span className="text-muted-foreground">{key}</span>
                    {""}
                    <span className="line-through opacity-60">
                      {show(value.from)}
                    </span>
                    {" →"}
                    <span className="font-semibold">{show(value.to)}</span>
                  </p>
                ))}
              </div>

              {entry.reason && (
                <p className="text-[0.92rem] text-muted-foreground">
                  {entry.reason}
                </p>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={busy === entry.id}
              onClick={() => undo(entry)}
              className="h-8 shrink-0 border-foreground/[0.06] text-[0.86rem] uppercase tracking-[0.15em]"
            >
              <Undo2 className="mr-1.5 h-3 w-3" />
              Undo
            </Button>
          </div>
        )}
      </PagedList>
    </section>
  );
}
