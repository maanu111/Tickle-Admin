"use client";
import { useCallback, useMemo, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw } from "lucide-react";
import { FairnessEditor } from "@/components/FairnessEditor";
import { FreshStartPanel } from "@/components/discovery/FreshStartPanel";
import { Divider, Explainer, PageHeader, PageSkeleton } from "@/components/ui/page";
import { Segmented } from "@/components/ui/select";
import { Pagination, paginate, usePagination } from "@/components/ui/pagination";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { useConfirm } from "@/components/ui/confirm";
import { QuestionEditor } from "@/components/compat/QuestionEditor";
import { Plus, Pencil, Trash2 } from "lucide-react";

/**
 * The compatibility engine, from the outside.
 *
 * Two questions this page answers and nothing else can: is any given
 * question worth asking, and does the score actually separate people.
 *
 * A dimension answered by 8% of members is phrased badly or asked too late.
 * A distribution bunched above 80% means the weights are too generous to
 * distinguish anyone, and every match looks equally good — which is the same
 * as no matching at all.
 *
 * Individual answers are deliberately not here. Reading what one named
 * person said about jealousy or money is not moderation.
 *
 * Two subjects share this screen, and they were stacked with nothing
 * but a divider between them. The page called itself "Compatibility"
 * and said it was about sign-up questions — then, below the fold,
 * carried the pass cooldowns, the daily exposure cap and the new-member
 * boost, none of which are questions. Somebody looking for the fairness
 * settings had no reason to look here, and somebody reading the
 * dimensions table had a wall of unrelated fields under it.
 *
 * They are tabs now, and the page is called Matching, which is the one
 * word that honestly covers both.
 */

type Tab = "questions" | "visibility";

const TABS: { value: Tab; label: string }[] = [
  { value: "questions", label: "Questions" },
  { value: "visibility", label: "Who gets seen" },
];

/*
 * Anchors that live on the visibility tab.
 *
 * Taken from FairnessEditor's field list and FreshStartPanel, plus the
 * fresh-start wrapper on this page. A link to any of these has to open
 * that tab or it lands on a screen without the setting it named.
 */
const VISIBILITY_ANCHORS = new Set([
  "fresh-start",
  "exposure-cap",
  "reshow-gap",
  "second-chance",
  "pass-cooldown-1",
  "pass-cooldown-2",
  "pass-cooldown-3",
  "pass-permanent",
]);

const BLURB: Record<Tab, string> = {
  questions:
    "The questions a match score is built from, and whether each one actually tells people apart.",
  visibility:
    "How long somebody waits after a pass, how widely one profile may be shown, and the boost a new member gets.",
};

type Dimension = {
  key: string;
  label: string;
  question: string;
  kind: string;
  section: string;
  options: string[] | null;
  sort: number;
  quick_start: boolean;
  active: boolean;
  answered: number;
  must: number;
  rate: number;
};

type Bucket = { from: number; to: number; count: number };

type Pool = {
  rows: number;
  unranked: number;
  blocked: number;
  withPools: number;
  refreshedToday: number;
};

type Payload = {
  people: number;
  pairs: number;
  blocked: number;
  pool: Pool;
  median: number | null;
  buckets: Bucket[];
  sections: string[];
  dimensions: Dimension[];
};

export default function CompatibilityPage() {
  const confirm = useConfirm();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<Payload>("/api/compatibility");

    if (error) setError(error);
    else setData(data);

    setLoading(false);
  }, []);

  useLoadOnMount(load);

  const toggle = useCallback(
    async (dimension: Dimension, field: "active" | "quick_start") => {
      if (
        field === "active" &&
        dimension.active &&
        !(await confirm({
          title: `Turn off "${dimension.label}"?`,
          body: "Every match score in the app is worked out again. People keep the answers they already gave, but those answers stop counting towards who they are matched with.",
          confirmLabel: "Turn it off",
        }))
      ) {
        return;
      }

      setBusy(dimension.key);

      const { error } = await adminFetch("/api/compatibility", {
        method: "PATCH",
        body: JSON.stringify({ key: dimension.key, [field]: !dimension[field] }),
      });

      if (error) setError(error);
      else await load();

      setBusy(null);
    },
    [load, confirm],
  );

  /*
   * Writing or rewording a question.
   *
   * One handler for both: the payload carries a key when editing and a
   * kind when creating, and the route decides from the method. Keeping
   * them together is what stops the two drifting into different rules
   * about what a valid question is.
   */
  const [editorFor, setEditorFor] = useState<Dimension | null>(null);
  const [writing, setWriting] = useState(false);

  const saveQuestion = useCallback(
    async (payload: Record<string, unknown>) => {
      setBusy("editor");
      setError(null);

      const { error } = await adminFetch("/api/compatibility", {
        method: payload.key ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });

      if (error) setError(error);
      else {
        setEditorFor(null);
        setWriting(false);
        await load();
      }

      setBusy(null);
    },
    [load],
  );

  /*
   * Deleting a question.
   *
   * compat_answers cascades, so this throws away every answer anybody
   * gave it. The route refuses when somebody has answered unless it is
   * told to go ahead, which is what the second confirm is for — the
   * first one is not enough warning for something unrecoverable.
   */
  const removeQuestion = useCallback(
    async (dimension: Dimension) => {
      const ok = await confirm({
        title: `Delete "${dimension.label}"?`,
        body:
          dimension.answered > 0
            ? `${dimension.answered} ${dimension.answered === 1 ? "person has" : "people have"} answered this, and those answers go with it. Switching it off instead stops the question being asked and keeps them.`
            : "Nobody has answered it, so nothing is lost.",
        confirmLabel: "Delete it",
        tone: "danger",
      });

      if (!ok) return;

      setBusy(dimension.key);
      setError(null);

      const { error } = await adminFetch(
        `/api/compatibility?key=${encodeURIComponent(dimension.key)}&force=${dimension.answered > 0}`,
        { method: "DELETE" },
      );

      if (error) setError(error);
      else await load();

      setBusy(null);
    },
    [load, confirm],
  );

  const peak = useMemo(
    () => Math.max(1, ...(data?.buckets ?? []).map((bucket) => bucket.count)),
    [data],
  );

  // Resets when a filter shortens the list, so filtering while on a
  // later page cannot leave you looking at an empty one.
  const { page, setPage } = usePagination(data?.dimensions.length ?? 0);

  /*
   * The tab follows the link that opened the page.
   *
   * Three command-palette entries deep-link to anchors that live on the
   * visibility side — #fresh-start, #pass-cooldown-1, #exposure-cap.
   * Defaulting to Questions would drop every one of those on a tab that
   * does not contain the thing they named, which reads as a dead link
   * rather than as a tab that needs pressing.
   *
   * Read once, in a lazy initialiser: this is where the reader arrived,
   * not a value to keep in step afterwards.
   */
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "questions";

    const anchor = window.location.hash.slice(1);
    return VISIBILITY_ANCHORS.has(anchor) ? "visibility" : "questions";
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Matching"
        description="The questions behind a match score, and who gets seen."
        actions={
          <>
            <Segmented value={tab} onChange={setTab} options={TABS} />
            {tab === "questions" && (
              <Button
                variant="secondary"
                size="icon"
                onClick={load}
                disabled={loading}
                aria-label="Refresh"
              >
                <RefreshCw className={loading ? "animate-spin" : undefined} />
              </Button>
            )}
          </>
        }
      />

      <Explainer>{BLURB[tab]}</Explainer>

      {error && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/8 px-3.5 py-2.5 text-[0.92rem] text-destructive">
          {error}
        </div>
      )}

      {tab === "questions" && (loading || !data) ? (
        <PageSkeleton sections={2} />
      ) : tab === "questions" && data ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Stat label="People who answered" value={data.people} />
            <Stat label="Pairs with a score" value={data.pairs} />
            <Stat label="Typical score" value={data.median != null ? `${data.median}%` :"-"} />
            <Stat label="Blocked by a dealbreaker" value={data.blocked} />
          </div>

          <Card className="border-foreground/[0.06] bg-card">
            <CardHeader>
              <CardTitle>Are people running out of profiles?</CardTitle>
              <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
                Everyone gets a queue of profiles to swipe through, rebuilt as they
                get near the end. If the numbers here shrink, people are running out
                of new faces — which usually means the city needs more members, not
                different settings.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <PoolStat label="Profiles queued up to show" value={data.pool.rows} />
                <PoolStat
                  label="Still unscored"
                  value={data.pool.unranked}
                  warn={data.pool.rows > 0 && data.pool.unranked / data.pool.rows > 0.4}
                  note={
                    data.pool.rows > 0
                      ? `${Math.round((data.pool.unranked / data.pool.rows) * 100)}% of the queue`
                      : undefined
                  }
                />
                <PoolStat label="Members with profiles to swipe" value={data.pool.withPools} />
                <PoolStat label="Queues refreshed today" value={data.pool.refreshedToday} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-foreground/[0.06] bg-card">
            <CardHeader>
              {/*
                This said a middle hump meant the questions were failing,
                which is the opposite of what the code comment below it
                says and of what the shape means. A hump in the middle is
                the healthy result: most people are a so-so match, a few
                are great, a few are poor. Everything piled at the top is
                the broken case.
              */}
              <CardTitle>Are the questions telling people apart?</CardTitle>
              <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
                How well every pair of members scores against each other. You want a
                hump in the middle — most people a so-so match, a few great, a few
                poor. If it is all bunched at the right, everyone looks like a
                perfect match, which is the same as no matching at all.
              </p>
            </CardHeader>
            <CardContent>
              {/* A healthy spread has a hump in the middle. Everything piled
                  into 80-100 means the weights cannot tell anyone apart. */}
              <div className="flex h-40 items-end gap-2">
                {data.buckets.map((bucket) => (
                  <div key={bucket.from} className="flex flex-1 flex-col items-center gap-2">
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className="w-full bg-foreground/80"
                        style={{ height: `${(bucket.count / peak) * 100}%` }}
                        title={`${bucket.count} pairs`}
                      />
                    </div>
                    <span className="text-[0.8rem] text-muted-foreground">{bucket.from}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-foreground/[0.06] bg-card">
            <CardHeader>
              {/*
                Was "Dimensions", which is the word the code uses for a
                row in this table and means nothing to anyone else. Each
                one is a question people answer at sign-up; the score is
                how closely two people's answers line up.
              */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>The questions</CardTitle>
                  <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
                    People answer these when they join. Two people who answer alike
                    score higher with each other. A question almost nobody answers
                    is worth rewording or switching off.
                  </p>
                </div>

                <Button
                  onClick={() => setWriting(true)}
                  className="h-9 shrink-0 text-[0.86rem]"
                >
                  <Plus className="mr-1.5 size-3.5" />
                  Add a question
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-foreground/[0.06] hover:bg-transparent">
                    {/*
                      Every one of these was a field name. "Must-match"
                      is the count of people who called it a dealbreaker,
                      "Quick start" is whether it is asked during signup
                      or left for later, and "Active" is whether it
                      counts at all — none of which those words said.
                    */}
                    <TableHead>Question</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead className="text-right">Answered it</TableHead>
                    <TableHead className="text-right">Call it a dealbreaker</TableHead>
                    <TableHead className="w-32">Asked at signup</TableHead>
                    <TableHead className="w-28">Counts</TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <>
                    {paginate(data.dimensions, page).map((dimension) => (
                    <TableRow key={dimension.key} className="border-foreground/[0.06]">
                      <TableCell>
                        <div className="font-medium">{dimension.label}</div>
                        <div className="max-w-md truncate text-[0.86rem] text-muted-foreground">
                          {dimension.question}
                        </div>
                      </TableCell>
                      <TableCell className="text-[0.92rem] text-muted-foreground">
                        {dimension.section}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="tabular-nums">{dimension.answered}</span>
                        <span
                          className={`ml-2 text-[0.86rem] ${
                            dimension.rate < 40 ? "text-destructive" :"text-muted-foreground"
                          }`}
                        >
                          {dimension.rate}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {dimension.must ||"-"}
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => toggle(dimension, "quick_start")}
                          disabled={busy === dimension.key}
                          className="text-[0.86rem] text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {dimension.quick_start ? "Yes" : "Later"}
                        </button>
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => toggle(dimension, "active")}
                          disabled={busy === dimension.key}
                        >
                          <Badge
                            variant="outline"
                            className={`text-[0.86rem] ${
                              dimension.active
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                                :"border-foreground/[0.06] bg-muted text-muted-foreground"
                            }`}
                          >
                            {dimension.active ? "Yes" : "No"}
                          </Badge>
                        </button>
                      </TableCell>

                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy === dimension.key}
                            onClick={() => setEditorFor(dimension)}
                            aria-label={`Edit ${dimension.label}`}
                            title="Reword this question"
                          >
                            <Pencil className="size-3.5" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy === dimension.key}
                            onClick={() => removeQuestion(dimension)}
                            aria-label={`Delete ${dimension.label}`}
                            title="Delete this question"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  </>
                </TableBody>
              </Table>

              {/* Outside the table. Pagination renders a <div>, which is
                  not valid inside a tbody — the browser lifts it out
                  during parse, so the server and client trees disagree
                  and hydration fails. */}
              <div className="pt-3">
                <Pagination page={page} total={data.dimensions.length} onPage={setPage} />
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {/*
        The visibility settings, on a tab of their own.

        These were below the dimensions table behind a divider, on a page
        that described itself as being about sign-up questions. Both
        halves are about matching, but only one is about questions —
        and a setting nobody expects to find on a screen is a setting
        nobody finds.
      */}
      {tab === "visibility" && (
        <div className="space-y-6">
          <Divider
            title="Being fair about who gets seen"
            hint="How long somebody waits after a pass, and how widely one profile may be shown."
          />
          <FairnessEditor />

          <div id="fresh-start" className="scroll-mt-24 space-y-5">
            <Divider
              title="Fresh Start Boost"
              hint="Extra visibility for a member's first days, so a new profile is not the least seen one."
              className="mt-8"
            />
            <FreshStartPanel />
          </div>
        </div>
      )}

      {/*
        Keyed on the question so the editor's fields start from the row
        being edited. Without a key React reuses the mounted instance and
        the second question you open shows the first one's wording.
      */}
      {(writing || editorFor) && (
        <QuestionEditor
          key={editorFor?.key ?? "new"}
          question={editorFor}
          sections={data?.sections ?? []}
          busy={busy === "editor"}
          onSave={saveQuestion}
          onCancel={() => {
            setEditorFor(null);
            setWriting(false);
          }}
        />
      )}
    </div>
  );
}

function PoolStat({
  label,
  value,
  note,
  warn,
}: {
  label: string;
  value: number;
  note?: string;
  warn?: boolean;
}) {
  return (
    <div>
      <div className={`tnum text-[1.6rem] font-light tracking-tight ${warn ? "text-destructive" :""}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-[1rem] leading-relaxed text-muted-foreground">{label}</div>
      {note && <div className="text-[0.8rem] text-muted-foreground">{note}</div>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="border-foreground/[0.06] bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-[0.92rem] font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="tnum text-[1.9rem] font-light tracking-tight">{value}</CardContent>
    </Card>
  );
}
