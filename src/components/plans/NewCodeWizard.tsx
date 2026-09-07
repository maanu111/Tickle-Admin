"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useModalLock } from "@/lib/useModalLock";
import { adminFetch } from "@/lib/adminFetch";
import { Check, X } from "lucide-react";

/**
 * Making a promo code, one question at a time.
 *
 * The old form was eight controls in a row wearing placeholders —
 * "value", "uses", "days" — with raw database values in the dropdowns:
 * `premium_discount`, `pack_bonus`, `lapsed`. Nothing on it said what
 * a code would actually do, so the only way to find out was to make
 * one and try it.
 *
 * Four short steps instead, each asking one thing in plain words, and
 * a summary at the end that says the code in a sentence. Nothing is
 * written until that summary is confirmed.
 */

export type CodeDraft = {
  code: string;
  label: string;
  kind: string;
  value: string;
  maxUses: string;
  days: string;
  city: string;
  segment: string;
};

/**
 * What each reward actually is, in words.
 *
 * The keys are the database's; everything a person reads here is
 * written for the person. "premium_discount" tells you nothing about
 * what somebody redeeming it gets.
 */
const REWARDS: Record<string, { label: string; unit: string; hint: string }> = {
  roses: {
    label: "Free roses",
    unit: "roses",
    hint: "Credited straight to their wallet.",
  },
  premium_days: {
    label: "Free Premium",
    unit: "days",
    hint: "Days of Premium, on top of anything they already have.",
  },
  super_likes: {
    label: "Free Super Likes",
    unit: "Super Likes",
    hint: "Added to their daily allowance, once.",
  },
  premium_discount: {
    label: "Money off Premium",
    unit: "% off",
    hint: "A percentage off their next Premium purchase.",
  },
  pack_bonus: {
    label: "Bonus on a rose pack",
    unit: "% extra",
    hint: "Extra roses on top of whatever pack they buy.",
  },
};

/** Who a code can be limited to, said as a person rather than a flag. */
const SEGMENTS: Record<string, string> = {
  "": "Anyone",
  new: "People who just joined",
  free: "People who have never paid",
  premium: "People who pay already",
  lapsed: "People whose Premium ran out",
};

type City = { slug: string; name: string; people?: number };

const STEPS = ["The code", "The reward", "Who and where", "Check it"] as const;

export function NewCodeWizard({
  rewardKinds,
  cities,
  busy,
  onCancel,
  onCreate,
}: {
  rewardKinds: string[];
  cities: City[];
  busy: boolean;
  onCancel: () => void;
  onCreate: (draft: CodeDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<CodeDraft>({
    code: "",
    label: "",
    kind: "roses",
    value: "25",
    maxUses: "100",
    days: "30",
    city: "",
    segment: "",
  });

  const [step, setStep] = useState(0);
  // Held rather than derived: by the time the animation runs the index
  // has already changed and there is nothing left to compare against.
  const [direction, setDirection] = useState(1);

  useModalLock(true);

  const set = useCallback(
    (key: keyof CodeDraft, value: string) =>
      setDraft((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const go = useCallback(
    (next: number) => {
      setDirection(next > step ? 1 : -1);
      setStep(next);
    },
    [step],
  );

  // Memoised because the summary below depends on it, and a fresh
  // object every render would rebuild that sentence every keystroke.
  const reward = useMemo(
    () => REWARDS[draft.kind] ?? { label: draft.kind, unit: "", hint: "" },
    [draft.kind],
  );

  /*
   * Whether this step can be left.
   *
   * A code has to be typeable and a reward has to have a number, or
   * the row that gets written is one nobody can redeem.
   */
  const complete = useMemo(() => {
    if (step === 0) return draft.code.trim().length >= 3 && draft.label.trim().length >= 2;
    if (step === 1) return draft.value.trim() !== "" && Number.isFinite(Number(draft.value));
    return true;
  }, [step, draft]);

  const last = step === STEPS.length - 1;

  /** The whole code, said as one sentence. */
  const summary = useMemo(() => {
    const who = SEGMENTS[draft.segment] ?? "Anyone";
    // The field holds the city name itself now, not a slug into a table.
    const where = draft.city.trim() ? ` in ${draft.city.trim()}` : "";
    const cap = draft.maxUses.trim()
      ? `the first ${draft.maxUses} people`
      : "anybody, with no limit";
    const expiry = draft.days.trim() ? ` It stops working in ${draft.days} days.` : "";

    return `${who}${where} can redeem ${draft.code.trim() || "this code"} for ${draft.value} ${reward.unit} — ${cap}.${expiry}`;
  }, [draft, reward]);

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-foreground/[0.12] p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        onClick={(event) => event.stopPropagation()}
        className="surface-float flex max-h-[86vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-foreground/[0.06] p-5">
          <h2 className="text-[1.05rem] font-bold">{STEPS[step]}</h2>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Cancel"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex gap-1.5 px-5 pt-4">
          {STEPS.map((title, index) => (
            <button
              key={title}
              type="button"
              disabled={index > step}
              onClick={() => go(index)}
              className={`h-1 flex-1 rounded-full transition-colors ${
                index <= step ? "bg-foreground" : "bg-foreground/10"
              }`}
              aria-label={title}
            />
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={SLIDE}
              initial="enter"
              animate="settled"
              exit="leave"
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-5"
            >
              {step === 0 && (
                <>
                  <Field
                    id="code"
                    label="What people type"
                    hint="Letters and numbers. Shown to them exactly like this."
                    required
                  >
                    <Input
                      id="code"
                      value={draft.code}
                      onChange={(e) => set("code", e.target.value.toUpperCase())}
                      placeholder="SUMMER25"
                      className="h-11 px-3 font-mono"
                    />
                  </Field>

                  <Field
                    id="label"
                    label="What you call it"
                    hint="For your own list. Members never see this."
                    required
                  >
                    <Input
                      id="label"
                      value={draft.label}
                      onChange={(e) => set("label", e.target.value)}
                      placeholder="Summer campaign"
                      className="h-11 px-3"
                    />
                  </Field>
                </>
              )}

              {step === 1 && (
                <>
                  <Field id="kind" label="What they get" hint={reward.hint}>
                    <Select
                      value={draft.kind}
                      onChange={(v) => set("kind", v)}
                      options={rewardKinds.map((key) => ({
                        value: key,
                        label: REWARDS[key]?.label ?? key,
                      }))}
                      className="w-full"
                    />
                  </Field>

                  <Field
                    id="value"
                    label={`How many ${reward.unit}`}
                    hint="The amount one redemption gives."
                    required
                  >
                    <Input
                      id="value"
                      type="number"
                      value={draft.value}
                      onChange={(e) => set("value", e.target.value)}
                      className="h-11 px-3"
                    />
                  </Field>
                </>
              )}

              {step === 2 && (
                <>
                  <Field
                    id="segment"
                    label="Who can use it"
                    hint="Everyone, unless you narrow it."
                  >
                    <Select
                      value={draft.segment}
                      onChange={(v) => set("segment", v)}
                      options={Object.entries(SEGMENTS).map(([value, label]) => ({
                        value,
                        label,
                      }))}
                      className="w-full"
                    />
                  </Field>

                  <Field
                    id="city"
                    label="Where"
                    hint="Only people in that city can redeem it. Leave empty for everywhere."
                  >
                    <CityField
                      value={draft.city}
                      onChange={(v) => set("city", v)}
                      cities={cities}
                    />
                  </Field>

                  <Field
                    id="maxUses"
                    label="How many people can use it"
                    hint="Leave blank for no limit — but then there is no ceiling on what it costs."
                  >
                    <Input
                      id="maxUses"
                      type="number"
                      value={draft.maxUses}
                      onChange={(e) => set("maxUses", e.target.value)}
                      placeholder="No limit"
                      className="h-11 px-3"
                    />
                  </Field>

                  <Field
                    id="days"
                    label="Stops working after"
                    hint="Days from now. Blank means it never expires."
                  >
                    <Input
                      id="days"
                      type="number"
                      value={draft.days}
                      onChange={(e) => set("days", e.target.value)}
                      placeholder="Never"
                      className="h-11 px-3"
                    />
                  </Field>
                </>
              )}

              {/*
                The whole thing as one sentence.

                Every field above is a fragment; this is the only place
                somebody can read what they have actually built before
                it exists.
              */}
              {step === 3 && (
                <div className="space-y-4">
                  <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-4">
                    <div className="font-mono text-[1.2rem] font-bold">
                      {draft.code || "—"}
                    </div>
                    <p className="mt-2 text-[0.92rem] leading-relaxed">{summary}</p>
                  </div>

                  {!draft.maxUses.trim() && (
                    <p className="text-[0.86rem] leading-relaxed text-destructive">
                      No usage limit. Whoever finds this code can share it, and the
                      cost has no ceiling.
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-2 border-t border-foreground/[0.06] p-4">
          <Button
            variant="outline"
            onClick={() => (step === 0 ? onCancel() : go(step - 1))}
            className="h-10 text-[0.86rem]"
          >
            {step === 0 ? "Cancel" : "Back"}
          </Button>

          <div className="flex-1 text-center text-[0.8rem] text-muted-foreground">
            Step {step + 1} of {STEPS.length}
          </div>

          {last ? (
            <Button
              onClick={() => onCreate(draft)}
              disabled={busy}
              className="h-10 text-[0.86rem]"
            >
              <Check className="mr-1.5 size-3.5" />
              {busy ? "Creating" : "Create code"}
            </Button>
          ) : (
            <Button
              onClick={() => go(step + 1)}
              disabled={!complete}
              className="h-10 text-[0.86rem]"
            >
              Next
            </Button>
          )}
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

/**
 * How a step arrives and leaves.
 *
 * Variants rather than inline objects, because `custom` — the number
 * saying which way we are going — is only threaded through to variant
 * functions.
 */
const SLIDE = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 24 }),
  settled: { opacity: 1, x: 0 },
  leave: (direction: number) => ({ opacity: 0, x: direction * -24 }),
};

function Field({
  id,
  label,
  hint,
  required,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-center gap-1 text-[0.86rem] font-medium">
        {label}
        {/* A dot, not an asterisk: it marks the field without making the
            label read like a footnote. */}
        {required && (
          <span className="size-1.5 rounded-full bg-destructive" aria-label="required" />
        )}
      </label>
      <p className="text-[0.8rem] leading-relaxed text-muted-foreground">{hint}</p>
      {children}
    </div>
  );
}

/**
 * Picking a city, spelled the way the app spells it.
 *
 * Two problems with a plain text box. The city on a promo code is
 * compared to profiles.city as lowercase text, so "Bengaluru" and
 * "Bangalore" are the same place and two different codes — one of which
 * silently reaches nobody. And a typo is invisible: the code saves, the
 * list shows it, and it simply never matches.
 *
 * So the suggestions come from Google, restricted to localities, which
 * is the same lookup the app uses when it fills in somebody's city.
 * Asking the same source is what makes the two strings match.
 *
 * The cities members are already in are shown first and need no call —
 * those are both the likeliest choice and the only ones known to have
 * anybody in them.
 */
function CityField({
  value,
  onChange,
  cities,
}: {
  value: string;
  onChange: (value: string) => void;
  cities: City[];
}) {
  const [open, setOpen] = useState(false);
  const [found, setFound] = useState<{
    query: string;
    list: { id: string; name: string; region: string }[];
  }>({ query: "", list: [] });

  const rootRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<DOMRect | null>(null);

  // Measured on open and re-measured while the wizard body scrolls, or
  // the fixed list detaches from the field it belongs to.
  useLayoutEffect(() => {
    if (!open) return;

    const measure = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (rect) setBox(rect);
    };

    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  const query = value.trim();

  /*
   * Debounced, because Google is charged per call and an undebounced
   * field bills one for every keystroke.
   */
  useEffect(() => {
    if (query.length < 2) return;

    let alive = true;

    const timer = window.setTimeout(async () => {
      const { data } = await adminFetch<{
        cities: { id: string; name: string; region: string }[];
      }>(`/api/city-search?q=${encodeURIComponent(query)}`);

      // Stamped with the query it answers, so a slow reply for an
      // earlier query cannot overwrite a newer one.
      if (alive) setFound({ query, list: data?.cities ?? [] });
    }, 350);

    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  /*
   * Results are kept only while they answer the current query.
   *
   * Derived rather than cleared inside the effect: setting state on
   * every keystroke to blank a list is a render loop waiting to happen,
   * and "are these suggestions still for what I typed" is a display
   * question anyway. It also makes the loading state honest — we are
   * looking whenever the answer we hold is for an older query.
   */
  const fresh = found.query === query ? found.list : [];
  const looking = query.length >= 2 && found.query !== query;

  // Members' own cities, filtered as you type. These are free.
  const mine = query
    ? cities.filter((city) => city.name.toLowerCase().includes(query.toLowerCase()))
    : cities;

  // Google may return a city already in the list above; showing it twice
  // reads as a bug rather than as two sources agreeing.
  const known = new Set(mine.map((city) => city.name.toLowerCase()));
  const extra = fresh.filter((city) => !known.has(city.name.toLowerCase()));

  const pick = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  // How many members this scoping would actually reach. Compared the way
  // redeem_promo() compares it: lowercase, exact.
  const reaches = query
    ? (cities.find((city) => city.name.toLowerCase() === query.toLowerCase())?.people ?? 0)
    : 0;

  return (
    <div ref={rootRef} className="relative">
      <Input
        id="city"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Delayed so a click on a suggestion lands before the list goes.
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        placeholder="Everywhere"
        autoComplete="off"
      />

      {/*
        Portalled, for the same reason Select is.

        The wizard body scrolls and the wizard itself is
        overflow-hidden, so a list positioned inside it is clipped at
        the first of those two edges it reaches. Rendering to <body> at
        the trigger's measured position escapes both — and z-[400] puts
        it above the z-[300] modal rather than behind it.
      */}
      {open && box && (mine.length > 0 || extra.length > 0 || looking) && createPortal(
        <div
          style={{
            position: "fixed",
            top: box.bottom + 6,
            left: box.left,
            minWidth: box.width,
            maxHeight: Math.max(160, window.innerHeight - box.bottom - 24),
          }}
          className="z-[400] overflow-auto rounded-lg border border-foreground/10 bg-card py-1 shadow-lg">
          {mine.length > 0 && (
            <>
              <p className="px-3 py-1 text-[0.75rem] font-medium text-muted-foreground">
                Where your members are
              </p>
              {mine.map((city) => (
                <Suggestion
                  key={city.slug}
                  name={city.name}
                  note={
                    typeof city.people === "number"
                      ? `${city.people} ${city.people === 1 ? "member" : "members"}`
                      : undefined
                  }
                  onPick={() => pick(city.name)}
                />
              ))}
            </>
          )}

          {extra.length > 0 && (
            <>
              <p className="px-3 py-1 text-[0.75rem] font-medium text-muted-foreground">
                Everywhere else — nobody there yet
              </p>
              {extra.map((city) => (
                <Suggestion
                  key={city.id}
                  name={city.name}
                  note={city.region}
                  onPick={() => pick(city.name)}
                />
              ))}
            </>
          )}

          {looking && extra.length === 0 && (
            <p className="px-3 py-1.5 text-[0.86rem] text-muted-foreground">Searching…</p>
          )}
        </div>,
        document.body,
      )}

      {/*
        The one mistake this field exists to prevent.

        A code is matched against profiles.city as text, and Google does
        not always agree with what members typed — it calls Mohali
        "Sahibzada Ajit Singh Nagar". Picking that spelling saves a code
        that looks correct in the list and reaches nobody, with nothing
        anywhere to say why. Said plainly rather than blocked: scoping to
        a city you are about to launch in is legitimate.
      */}
      {!open && reaches === 0 && query.length > 1 && (
        <p className="mt-1.5 text-[0.8rem] leading-relaxed text-warning">
          No members have {query} as their city, so nobody can redeem this yet. Check the
          spelling matches what the app saved for them.
        </p>
      )}
    </div>
  );
}

function Suggestion({
  name,
  note,
  onPick,
}: {
  name: string;
  note?: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      // Stops the input blurring before the click registers.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
      className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[0.92rem] hover:bg-foreground/[0.04]"
    >
      <span>{name}</span>
      {note && <span className="shrink-0 text-[0.8rem] text-muted-foreground">{note}</span>}
    </button>
  );
}
