"use client";
import { useCallback, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { classify, VERDICT_COPY } from "@/lib/placeTypes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, RefreshCw } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Pagination, paginate, usePagination } from "@/components/ui/pagination";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { PagedList } from "@/components/ui/paged-list";
import { useConfirm } from "@/components/ui/confirm";

/**
 * Where hearts may be dropped.
 *
 * The most consequential screen in the panel. Allowing a category means
 * strangers can be pointed at a place and told somebody is there — fine
 * for a café, not fine for a clinic, a school, or the building somebody
 * lives in.
 *
 * Blocking takes down the hearts already there. A block that only
 * governed the future would leave the actual problem live.
 *
 * This was five cards in an order nobody chose: capture radius first,
 * then allowed and blocked categories side by side, then blocked
 * venues, then a form to add a category — and "Waiting on you", the one
 * part with anything to decide, last. Three of those cards were about
 * kinds of place, one was about a single venue, and one was a GPS
 * setting, with nothing on screen saying which was which.
 *
 * It now reads top to bottom in the order the questions actually come
 * up: what needs deciding, what the standing rules are, exceptions to
 * them, then the setting almost nobody touches.
 */

type Category = {
  id: string;
  category: string;
  label: string;
  allowed: boolean;
  reason: string | null;
};

type Blocked = {
  id: string;
  reason: string;
  created_at: string;
  places: { name: string; address: string } | null;
};

type Payload = {
  categories: Category[];
  blocked: Blocked[];
  places: { id: string; name: string; category: string; address: string }[];
  captureRadius: number;
  unclassified: string[];
};

export function VenueRulesPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const [blockPlace, setBlockPlace] = useState("");
  const [blockReason, setBlockReason] = useState("");

  const confirm = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<Payload>("/api/venues");

    if (error) setError(error);
    else setData(data ?? null);

    setLoading(false);
  }, []);

  useLoadOnMount(load);

  const patch = useCallback(
    async (update: Record<string, unknown>) => {
      setBusy(true);

      const { error } = await adminFetch("/api/venues", {
        method: "PATCH",
        body: JSON.stringify(update),
      });

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  const add = useCallback(
    async (payload: Record<string, unknown>) => {
      setBusy(true);

      const { error } = await adminFetch("/api/venues", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  const unblock = useCallback(
    async (id: string) => {
      setBusy(true);

      const { error } = await adminFetch(`/api/venues?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  /*
   * Blocking a category is the destructive one.
   *
   * It takes down every heart at every venue of that kind, and the old
   * screen did it on a single click of an unlabelled pill. Allowing is
   * left immediate: it adds nothing and is trivially reversed.
   */
  const blockCategory = useCallback(
    async (entry: Category) => {
      const ok = await confirm({
        title: `Refuse hearts at every ${entry.label.toLowerCase()}?`,
        body: "Hearts already left at places of this kind come down straight away.",
        confirmLabel: "Block it",
        tone: "danger",
      });

      if (ok) await patch({ id: entry.id, allowed: false });
    },
    [confirm, patch],
  );

  const allowed = (data?.categories ?? []).filter((entry) => entry.allowed);
  const blocked = (data?.categories ?? []).filter((entry) => !entry.allowed);
  const blockedVenues = data?.blocked ?? [];
  const waiting = data?.unclassified ?? [];

  const { page, setPage } = usePagination(blockedVenues.length);

  return (
    <div className="space-y-8">
      {error && <p className="text-[0.92rem] text-destructive">{error}</p>}

      {/*
        Anything undecided comes first, and only exists while there is
        something in it. Until somebody decides, hearts at these places
        are refused — so this is the one part of the screen with a cost
        to ignoring it.
      */}
      {waiting.length > 0 && (
        <CategorySuggestions
          categories={waiting}
          busy={busy}
          // POST, not PATCH: these categories have no row yet — deciding
          // one is what creates it. PATCH needs an id and would reject
          // every decision made on this list.
          onDecide={(category, allowed, reason) =>
            add({
              entity: "category",
              category,
              label: prettyLabel(category),
              allowed,
              reason: allowed ? "" : reason,
            })
          }
        />
      )}

      {/* ── The standing rules ─────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h3 className="text-[0.92rem] font-bold">Kinds of place</h3>
            <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
              This decides every venue of that kind at once — every café, every
              clinic. Press one to move it to the other side.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setAdding((open) => !open)}
              className="h-9 text-[0.86rem]"
            >
              <Plus className="mr-1.5 size-3.5" />
              Add a kind
            </Button>

            <Button
              variant="secondary"
              size="icon"
              onClick={load}
              disabled={loading}
              aria-label="Refresh"
            >
              <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
            </Button>
          </div>
        </div>

        {adding && (
          <div className="rounded-xl border border-foreground/[0.06] p-4">
            <AddCategory
              busy={busy}
              onAdd={async (payload) => {
                await add(payload);
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <RuleColumn
            title="Hearts allowed"
            hint="Press one to start refusing hearts there."
            empty="Nothing is allowed yet."
            count={allowed.length}
          >
            <PagedList items={allowed} perPage={40} className="flex flex-wrap gap-2">
              {(entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => blockCategory(entry)}
                  disabled={busy}
                  title={`Stop allowing hearts at every ${entry.label.toLowerCase()}`}
                  className="rounded-full border border-foreground/[0.12] px-3 py-1.5 text-[0.92rem] transition-colors hover:border-destructive hover:text-destructive"
                >
                  {entry.label}
                </button>
              )}
            </PagedList>
          </RuleColumn>

          <RuleColumn
            title="Hearts refused"
            hint="Press one to start allowing hearts there."
            empty="Nothing is blocked."
            count={blocked.length}
          >
            <PagedList items={blocked} perPage={40} className="flex flex-wrap gap-2">
              {(entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => patch({ id: entry.id, allowed: true })}
                  disabled={busy}
                  title={entry.reason ?? `Allow hearts at every ${entry.label.toLowerCase()}`}
                  className="rounded-full border border-destructive/30 bg-destructive/[0.06] px-3 py-1.5 text-[0.92rem] text-destructive transition-colors hover:border-foreground/25 hover:bg-transparent hover:text-foreground"
                >
                  {entry.label}
                </button>
              )}
            </PagedList>
          </RuleColumn>
        </div>
      </section>

      {/* ── Exceptions to those rules ──────────────────── */}
      <section className="space-y-3">
        <div>
          <h3 className="text-[0.92rem] font-bold">One-off exceptions</h3>
          <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
            A single venue, blocked even though its kind is allowed — one café
            with a problem, rather than every café. Blocking removes the hearts
            already there.
          </p>
        </div>

        <div className="space-y-3 rounded-xl border border-foreground/[0.06] p-4">
          <div className="flex flex-wrap gap-2">
            <Select
              value={blockPlace}
              onChange={(next) => setBlockPlace(next as never)}
              options={[
                { value: "", label: "Choose a venue…" },
                ...(data?.places ?? []).map((place) => ({
                  value: String(place.id),
                  label: String(place.name),
                })),
              ]}
              className="w-[14rem]"
            />

            <Input
              value={blockReason}
              onChange={(event) => setBlockReason(event.target.value)}
              placeholder="Why this one is blocked"
              className="min-w-[200px] flex-1"
            />

            <Button
              variant="destructive"
              disabled={busy || !blockPlace || blockReason.length < 3}
              onClick={() => {
                add({ entity: "venue", place_id: blockPlace, reason: blockReason });
                setBlockPlace("");
                setBlockReason("");
              }}
              className="h-9 text-[0.86rem]"
            >
              Block this venue
            </Button>
          </div>

          {blockedVenues.length === 0 ? (
            !loading && (
              <p className="py-3 text-center text-[0.92rem] text-muted-foreground">
                No single venues blocked. The rules above are doing all the work.
              </p>
            )
          ) : (
            <div className="space-y-1">
              {paginate(blockedVenues, page).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 rounded-lg border border-foreground/[0.06] p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[0.92rem] font-medium">
                      {entry.places?.name ?? "Unknown"}
                    </div>
                    <div className="text-[0.86rem] text-muted-foreground">
                      {entry.reason}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => unblock(entry.id)}
                    className="text-[0.86rem]"
                  >
                    Unblock
                  </Button>
                </div>
              ))}

              <Pagination page={page} total={blockedVenues.length} onPage={setPage} />
            </div>
          )}
        </div>
      </section>

      {/* ── The one setting ────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h3 className="text-[0.92rem] font-bold">How close counts as there</h3>
          <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
            How close somebody has to be to a venue before the app lets them drop
            a heart there. Phone GPS is out by twenty or thirty metres, so set it
            too small and people standing inside the café are told they are not
            there; too large and somebody driving past can drop one.
          </p>
        </div>

        <CaptureRadius
          value={data?.captureRadius ?? 0}
          busy={busy}
          onSave={(metres) => patch({ capture_radius_m: metres })}
        />
      </section>
    </div>
  );
}

/** One side of the allowed/refused pair. */
function RuleColumn({
  title,
  hint,
  empty,
  count,
  children,
}: {
  title: string;
  hint: string;
  empty: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-foreground/[0.06] p-4">
      <div className="mb-3">
        <div className="text-[0.92rem] font-medium">
          {title} <span className="text-muted-foreground">({count})</span>
        </div>
        <p className="text-[0.8rem] leading-relaxed text-muted-foreground">{hint}</p>
      </div>

      {count === 0 ? (
        <p className="py-2 text-[0.86rem] text-muted-foreground">{empty}</p>
      ) : (
        children
      )}
    </div>
  );
}

/**
 * The capture radius, edited rather than typed straight into the table.
 *
 * A number input wired directly to a save is a setting you can change by
 * scrolling over it. This keeps the pending value local until Save.
 */
function CaptureRadius({
  value,
  busy,
  onSave,
}: {
  value: number;
  busy: boolean;
  onSave: (metres: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  // Keyed remount from the parent is not worth it for one field; this
  // catches the case where a reload brings a different saved value.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(String(value));
  }

  const parsed = Number(draft);
  const valid = draft.trim() !== "" && Number.isFinite(parsed) && parsed >= 5 && parsed <= 200;

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-foreground/[0.06] p-4">
      <div>
        <label htmlFor="capture-radius" className="block text-[0.86rem] font-medium">
          Metres
        </label>
        <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
          Between 5 and 200. 15 is about the width of a shop — leave it there
          unless people report hearts not dropping.
        </p>
        <Input
          id="capture-radius"
          type="number"
          inputMode="numeric"
          min={5}
          max={200}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="w-32"
        />
      </div>

      <Button
        onClick={() => onSave(Math.round(parsed))}
        disabled={busy || !valid || parsed === value}
        className="h-9 text-[0.86rem]"
      >
        {busy ? "Saving" : "Save"}
      </Button>
    </div>
  );
}

/**
 * Kinds of place Google has returned that nobody has ruled on.
 *
 * Ranked riskiest first, with a suggested verdict and the reason for it,
 * because the person deciding will not know that `physiotherapist` is a
 * medical type or that `lodging` covers both hotels and hostels. Two
 * buttons apply the decision; the reason travels with a block so the
 * next person reading the list knows why it is there.
 *
 * Nothing is applied automatically. A wrong automatic block quietly
 * removes venues, and a wrong automatic allow points strangers at a
 * clinic — neither is a decision code should be making on its own.
 */
function CategorySuggestions({
  categories,
  onDecide,
  busy,
}: {
  categories: string[];
  onDecide: (category: string, allowed: boolean, reason: string) => void;
  busy: boolean;
}) {
  // Riskiest first: a suggested block is the one worth reading.
  const ranked = [...categories]
    .map((category) => ({ category, rule: classify(category) }))
    .sort((a, b) => {
      const order = { block: 0, review: 1, allow: 2 } as const;
      return order[a.rule.verdict] - order[b.rule.verdict];
    });

  return (
    <section className="space-y-3 rounded-xl border border-warning/40 bg-warning/[0.04] p-4">
      <div>
        <h3 className="text-[0.92rem] font-bold">
          Waiting on you ({ranked.length})
        </h3>
        <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
          New kinds of place Google has started returning. Hearts are refused at
          all of them until you decide, so nothing here is urgent — but nothing
          here is working either.
        </p>
      </div>

      <div className="divide-y divide-foreground/[0.06]">
        {ranked.map(({ category, rule }) => {
          const copy = VERDICT_COPY[rule.verdict];

          return (
            <div
              key={category}
              className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 max-w-xl">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[0.92rem] font-medium">
                    {prettyLabel(category)}
                  </span>
                  <span className="font-mono text-[0.8rem] text-muted-foreground">
                    {category}
                  </span>
                  <span
                    className={
                      copy.tone === "destructive"
                        ? "text-[0.8rem] font-medium text-destructive"
                        : copy.tone === "success"
                          ? "text-[0.8rem] font-medium text-success"
                          : "text-[0.8rem] font-medium text-warning"
                    }
                  >
                    {copy.label}
                  </span>
                  {!rule.exact && (
                    <span className="text-[0.8rem] text-muted-foreground">
                      (matched by name)
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[0.86rem] leading-relaxed text-muted-foreground">
                  {rule.reason}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  variant={rule.verdict === "allow" ? "default" : "secondary"}
                  disabled={busy}
                  onClick={() => onDecide(category, true, "")}
                >
                  Allow
                </Button>
                <Button
                  size="sm"
                  variant={rule.verdict === "block" ? "default" : "secondary"}
                  disabled={busy}
                  onClick={() => onDecide(category, false, rule.reason)}
                >
                  Block
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AddCategory({
  onAdd,
  onCancel,
  busy,
}: {
  onAdd: (payload: Record<string, unknown>) => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [category, setCategory] = useState("");
  const [label, setLabel] = useState("");
  const [allowed, setAllowed] = useState(false);
  const [reason, setReason] = useState("");

  const ready = category.trim().length > 1 && (allowed || reason.trim().length > 2);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cat-key" className="block text-[0.86rem] font-medium">
            Google&rsquo;s name for it
          </label>
          <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
            Exactly as Google writes it, like <code>cafe</code> or{" "}
            <code>night_club</code>.
          </p>
          <Input
            id="cat-key"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="font-mono text-[0.86rem]"
          />
        </div>

        <div>
          <label htmlFor="cat-label" className="block text-[0.86rem] font-medium">
            What to call it here
          </label>
          <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
            Left empty, it is tidied up from the name above.
          </p>
          <Input
            id="cat-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={category ? prettyLabel(category) : "Café"}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className="block text-[0.86rem] font-medium">Hearts here?</span>
          <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
            Start it blocked if you are unsure.
          </p>
          <Select
            value={allowed ? "yes" : "no"}
            onChange={(next) => setAllowed(next === "yes")}
            options={[
              { value: "no", label: "Refused" },
              { value: "yes", label: "Allowed" },
            ]}
          />
        </div>

        {!allowed && (
          <div>
            <label htmlFor="cat-reason" className="block text-[0.86rem] font-medium">
              Why it is blocked
            </label>
            <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
              So the next person reading the list knows.
            </p>
            <Input
              id="cat-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Somewhere people live"
            />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          disabled={busy || !ready}
          onClick={() =>
            onAdd({
              entity: "category",
              category: category.trim(),
              label: label.trim() || prettyLabel(category.trim()),
              allowed,
              reason: allowed ? "" : reason.trim(),
            })
          }
          className="h-9 text-[0.86rem]"
        >
          {busy ? "Adding" : "Add it"}
        </Button>
        <Button variant="ghost" onClick={onCancel} className="h-9 text-[0.86rem]">
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** "night_club" reads as a database value; "Night Club" reads as a place. */
function prettyLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
