"use client";
import { useCallback, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Pagination, paginate, usePagination } from "@/components/ui/pagination";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { useConfirm } from "@/components/ui/confirm";

/**
 * Scam patterns and blocked domains.
 *
 * The continue rate is the most important column here. A rule that fires
 * often and is almost always dismissed is not protecting anyone — it is
 * spending the credibility of every other warning, and the honest
 * response is to retire it.
 *
 * No message text appears on this page, and no route returns any.
 */

type Rule = {
  id: string;
  category: string;
  pattern: string;
  label: string;
  weight: number;
  active: boolean;
};

type Domain = { id: string; domain: string; reason: string; active: boolean };

type Performance = Record<
  string,
  { flagged: number; continued: number; reported: number; blocked: number }
>;

type Payload = {
  rules: Rule[];
  domains: Domain[];
  performance: Performance;
  categories: string[];
  reasons: string[];
  totalFlags: number;
};

export function SafetyRulesPanel() {
  const confirm = useConfirm();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"rules" | "domains">("rules");

  const [newCategory, setNewCategory] = useState("money");
  const [newPattern, setNewPattern] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newWeight, setNewWeight] = useState("2");
  const [newDomain, setNewDomain] = useState("");
  const [newReason, setNewReason] = useState("shortener");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<Payload>("/api/safety");

    if (error) setError(error);
    else setData(data ?? null);

    setLoading(false);
  }, []);

  useLoadOnMount(load);

  const add = useCallback(
    async (payload: Record<string, unknown>) => {
      setBusy(true);

      const { error } = await adminFetch("/api/safety", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  /*
   * Deleting a rule, as opposed to switching it off.
   *
   * Off is the right answer for a rule you might want back. Delete is
   * for one that should never have existed — a bad pattern, a typo —
   * and without it those accumulate at the bottom of the list forever,
   * greyed out beside the corrected version.
   */
  const remove = useCallback(
    async (entity: string, id: string, label: string) => {
      const ok = await confirm({
        title: `Delete ${label}?`,
        body: "It stops being checked straight away, and it is gone for good. Switch it off instead if you might want it back.",
        confirmLabel: "Delete it",
        tone: "danger",
      });

      if (!ok) return;

      setBusy(true);

      const { error } = await adminFetch(
        `/api/safety?entity=${entity}&id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load, confirm],
  );

  const toggle = useCallback(
    async (entity: string, id: string, active: boolean) => {
      setBusy(true);

      const { error } = await adminFetch("/api/safety", {
        method: "PATCH",
        body: JSON.stringify({ entity, id, active }),
      });

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  const byCategory = (data?.rules ?? []).reduce<Record<string, Rule[]>>((acc, rule) => {
    (acc[rule.category] ??= []).push(rule);
    return acc;
  }, {});

  const domainRows = data?.domains ?? [];

  // Resets when a filter shortens the list, so filtering while on a
  // later page cannot leave you looking at an empty one.
  const { page, setPage } = usePagination(domainRows.length);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-2">
          <Button variant={tab === "rules" ? "default" :"outline"} size="sm" onClick={() => setTab("rules")}>
            Patterns
          </Button>
          <Button variant={tab === "domains" ? "default" :"outline"} size="sm" onClick={() => setTab("domains")}>
            Domains
          </Button>
          <Button variant="outline" size="icon" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" :"h-4 w-4"} />
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-[0.92rem] text-destructive">{error}</CardContent>
        </Card>
      )}

      {tab === "rules" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add a pattern</CardTitle>
              <p className="text-[0.92rem] text-muted-foreground">
                Words to watch for in messages. A weight of 3 warns on its own;
                a 1 only counts alongside other rules.
              </p>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Select
            value={newCategory}
            onChange={(next) => setNewCategory(next as never)}
            options={(data?.categories ?? []).map((category) => ({
              value: String(category),
              label: String(category),
            }))}
            className="w-[11rem]"
          />
              <Input
                value={newPattern}
                onChange={(event) => setNewPattern(event.target.value)}
                placeholder="Words or pattern to catch"
                className="min-w-[240px] flex-1 font-mono text-[0.86rem]"
              />
              <Input
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
                placeholder="What this is meant to catch"
                className="min-w-[180px] flex-1"
              />
              <Select
                value={newWeight}
                onChange={setNewWeight}
                options={[
                  { value: "1", label: "Weight 1" },
                  { value: "2", label: "Weight 2" },
                  { value: "3", label: "Weight 3" },
                ]}
                className="w-[9rem]"
              />
              <Button
                disabled={busy || newPattern.length < 3 || newLabel.length < 3}
                onClick={() => {
                  add({
                    entity: "rule",
                    category: newCategory,
                    pattern: newPattern,
                    label: newLabel,
                    weight: Number(newWeight),
                  });
                  setNewPattern("");
                  setNewLabel("");
                }}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add
              </Button>
            </CardContent>
          </Card>

          {Object.entries(byCategory).map(([category, rules]) => {
            const stats = data?.performance[category];
            // Only meaningful once a handful of people have answered.
            const answered = stats
              ? stats.continued + stats.reported + stats.blocked
              : 0;
            const continueRate =
              answered >= 5 ? Math.round((stats!.continued / answered) * 100) : null;

            return (
              <Card key={category}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base capitalize">{category}</CardTitle>

                  <div className="flex items-center gap-3 text-[0.92rem]">
                    {stats && (
                      <span className="text-muted-foreground">
                        {stats.flagged} shown · {stats.reported + stats.blocked} acted on
                      </span>
                    )}
                    {/* Above 80% dismissed is the point at which a rule is
                        costing more trust than it earns. */}
                    {continueRate !== null && (
                      <Badge variant={continueRate > 80 ? "destructive" :"secondary"}>
                        {continueRate}% dismissed
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-1">
                  {continueRate !== null && continueRate > 80 && (
                    <div className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[0.92rem]">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <span>
                        Almost everyone dismisses these. A warning people ignore makes every
                        other warning easier to ignore too — consider retiring the noisiest
                        pattern here.
                      </span>
                    </div>
                  )}

                    {rules.map((rule) => (
                    <div key={rule.id} className="flex items-center gap-3 rounded-lg border p-2">
                      <Badge variant="outline">{rule.weight}</Badge>

                      <div className="min-w-0 flex-1">
                        <div
                          className={
                            rule.active ? "text-[0.92rem] font-medium" :"text-[0.92rem] font-medium line-through opacity-50"
                          }
                        >
                          {rule.label}
                        </div>
                        <code className="block truncate text-[0.86rem] text-muted-foreground">
                          {rule.pattern}
                        </code>
                      </div>

                      <Button
                        variant={rule.active ? "ghost" :"default"}
                        size="sm"
                        disabled={busy}
                        onClick={() => toggle("rule", rule.id, !rule.active)}
                      >
                        {rule.active ? "Retire" :"Restore"}
                      </Button>

                      {/* Retire keeps it in the list, off. Delete is for
                          one that should not exist at all. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        aria-label={`Delete ${rule.label}`}
                        title="Delete this pattern"
                        onClick={() => remove("rule", rule.id, rule.label)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </>
      )}

      {tab === "domains" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Blocked domains</CardTitle>
            <p className="text-[0.92rem] text-muted-foreground">
              Shorteners are listed because they hide the destination, which is the whole
              technique — not because the host is malicious.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input
                value={newDomain}
                onChange={(event) => setNewDomain(event.target.value)}
                placeholder="example.com"
                className="max-w-xs"
              />
              <Select
            value={newReason}
            onChange={(next) => setNewReason(next as never)}
            options={(data?.reasons ?? []).map((reason) => ({
              value: String(reason),
              label: String(reason),
            }))}
            className="w-[11rem]"
          />
              <Button
                disabled={busy || !newDomain.includes(".")}
                onClick={() => {
                  add({ entity: "domain", domain: newDomain, reason: newReason });
                  setNewDomain("");
                }}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <>
                {paginate(domainRows, page).map((entry) => (
                <div
                  key={entry.id}
                  className={
                    entry.active
                      ? "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.92rem]"
                      :"flex items-center gap-2 rounded-full border border-dashed px-3 py-1.5 text-[0.92rem] text-muted-foreground line-through"
                  }
                >
                  <span className="font-mono text-[0.86rem]">{entry.domain}</span>
                  <Badge variant="secondary" className="text-[0.86rem]">
                    {entry.reason}
                  </Badge>
                  {/* Was a bare × and +, which said nothing about what
                      either did — and the × read as "delete" while it
                      only switched the domain off. */}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => toggle("domain", entry.id, !entry.active)}
                    className="text-[0.86rem]"
                  >
                    {entry.active ? "Allow" : "Block"}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    aria-label={`Delete ${entry.domain}`}
                    title="Remove from the list"
                    onClick={() => remove("domain", entry.id, entry.domain)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
                <Pagination page={page} total={domainRows.length} onPage={setPage} />
              </>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
