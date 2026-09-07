"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Search, CornerDownLeft, ArrowUp, ArrowDown, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import {
  searchCommands,
  type CommandEntry,
} from "@/lib/commandRegistry";
import { useModalLock } from "@/lib/useModalLock";
import { adminFetch } from "@/lib/adminFetch";

/**
 * Find anything in the panel.
 *
 * Two kinds of result, deliberately kept apart and always in this order:
 * what the panel *can do* comes first, and matching records come second.
 *
 * That order is the whole point. Typing"safety" should open the moderation
 * page, not offer a member whose bio happens to contain the word — and a
 * palette that mixes the two by relevance score gets that wrong regularly,
 * because a data row will always match more text than a page title.
 */

/**
 * A row found in the database rather than in the registry.
 *
 * The palette searched pages and members only, so everything else —
 * a venue, a scam pattern, a promo code, a job title — could be found
 * only by remembering which screen owned it and searching there. This
 * comes from /api/search, which asks thirteen tables at once.
 */
type RecordHit = {
  kind: string;
  group: string;
  label: string;
  hint: string;
  href: string;
};

const EMPTY_RECORDS: RecordHit[] = [];

const RECORD_DEBOUNCE_MS = 220;

export function CommandPalette() {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [records, setRecords] = useState<RecordHit[]>([]);
  const [searching, setSearching] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const latest = useRef(0);

  // Nothing behind the palette scrolls, clicks or takes focus while it
  // is open.
  useModalLock(open);

  const commands = useMemo(() => searchCommands(query), [query]);

  /*
   * People matching the query, or nothing while it is too short.
   *
   * Derived rather than cleared. The effect below used to setMembers([])
   * for a one-character query, which meant the previous results stayed
   * on screen for a render before being wiped — and the wipe was a
   * second render doing nothing but forgetting.
   */
  const shownRecords = query.trim().length < 2 ? EMPTY_RECORDS : records;

  /*
   * Records bundled under their source, keeping each row own flat index.
   *
   * The flat index is what the arrow keys move through, so it has to be
   * computed against the same order the list renders in — deriving it
   * from the group would make Down skip rows once a group had more than
   * one member.
   */
  const grouped = useMemo(() => {
    const groups: { label: string; rows: { record: RecordHit; flat: number }[] }[] = [];

    shownRecords.forEach((record, index) => {
      const flat = commands.length + index;
      const existing = groups.find((group) => group.label === record.group);

      if (existing) existing.rows.push({ record, flat });
      else groups.push({ label: record.group, rows: [{ record, flat }] });
    });

    return groups;
  }, [shownRecords, commands.length]);

  // One flat list, so arrow keys move through both sections without the
  // caller having to know where one ends.
  const results = useMemo(
    () => [
      ...commands.map((entry) => ({ type: "command" as const, entry })),
      ...shownRecords.map((record) => ({ type: "record" as const, record })),
    ],
    [commands, shownRecords]
  );

  /*
   * Closing clears the palette.
   *
   * This used to be an effect watching `open` go false, which meant the
   * component rendered once showing the old query and again showing it
   * empty. Doing it where the close happens is one render, and is the
   * pattern React documents for state that follows from an event.
   */
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setRecords([]);
    setActive(0);
  }, []);

  // ─── Opening ────────────────────────────────────────────

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Cmd+K on a Mac, Ctrl+K everywhere else, and"/" the way every
      // text-first tool has done it since IRC.
      const combo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const slash =
        event.key === "/" &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement);

      if (combo || slash) {
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }

      if (event.key === "Escape") close();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  useEffect(() => {
    if (!open) return;
    // Focus after the frame the dialog mounts in, or the ref is still
    // null. Touching the DOM is what an effect is actually for.
    const timer = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(timer);
  }, [open]);

  // ─── Live records ───────────────────────────────────────

  useEffect(() => {
    const q = query.trim();

    // Two characters, because one letter matches most of the table and the
    // request would be thrown away by the next keystroke anyway.
    // No request, and nothing stored either: what to show for a short
    // query is derived below from the query itself.
    if (q.length < 2) return;

    const ticket = ++latest.current;
    const timer = setTimeout(async () => {
      setSearching(true);

      /*
       * One request, thirteen tables.
       *
       * Through the panel route rather than straight at Supabase: RLS
       * scopes most of these to the signed-in member, so a browser
       * query would find almost nothing. The route reads with the
       * service role behind the same admin check as every other page.
       */
      const { data } = await adminFetch<{ results: RecordHit[] }>(
        `/api/search?q=${encodeURIComponent(q)}`,
      );

      // A slower earlier request must never overwrite a newer one — the
      // classic way a palette ends up showing results for a prefix the user
      // has already finished typing past.
      if (ticket !== latest.current) return;

      setRecords(data?.results ?? []);
      setSearching(false);
    }, RECORD_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  /*
   * The highlight goes back to the top when the query changes.
   *
   * Adjusted during render rather than in an effect — the pattern React
   * documents for "state that changes when a prop or another piece of
   * state changes". An effect would paint the old highlight against the
   * new results for one frame.
   */
  const [queryAtHighlight, setQueryAtHighlight] = useState(query);
  if (query !== queryAtHighlight) {
    setQueryAtHighlight(query);
    setActive(0);
  }

  // ─── Choosing ───────────────────────────────────────────

  const choose = useCallback(
    (index: number) => {
      const result = results[index];
      if (!result) return;

      close();

      if (result.type === "command") {
        // A handful of commands do something instead of going somewhere. The
        // registry names them by id and the handler lives here, so that file
        // stays plain data.
        if (result.entry.run === "signout") {
          void supabase.auth.signOut().then(() => router.push("/login"));
          return;
        }

        if (result.entry.href) router.push(result.entry.href);
        return;
      }

      router.push(result.record.href);
    },
    [results, router, close]
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => (value + 1) % Math.max(results.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => (value - 1 + results.length) % Math.max(results.length, 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(active);
    }
  };

  return (
    <>
      {/* The trigger doubles as the shortcut hint. A palette nobody knows
          about is a palette nobody uses, and the keys have to be visible
          somewhere that is not documentation. */}
      <button
        onClick={() => setOpen(true)}
        className="flex w-full max-w-md items-center gap-2 rounded-xl border border-foreground/15 bg-card/70 px-3 py-2 text-[0.92rem] text-muted-foreground transition-colors hover:border-foreground/25 hover:bg-card"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 text-left">Search pages, settings, people…</span>
        <kbd className="hidden rounded border border-foreground/[0.06] bg-background px-1.5 py-0.5 font-mono text-[0.8rem] sm:inline">
          ⌘K
        </kbd>
      </button>

      {/* Portalled to the body because useModalLock makes the whole app
          shell inert, and this button lives inside it. */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[150] flex items-start justify-center bg-foreground/[0.12] p-4 pt-[12vh]"
            onClick={close}
          >
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              onClick={(event) => event.stopPropagation()}
              className="surface-float w-full max-w-xl overflow-hidden rounded-2xl"
            >
              <div className="flex items-center gap-3 border-b border-foreground/[0.06] px-4">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Search pages, settings, actions, people…"
                  className="flex-1 bg-transparent py-4 text-[0.92rem] outline-none placeholder:text-muted-foreground"
                />
                {searching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              </div>

              <div className="max-h-[52vh] overflow-y-auto p-2">
                {results.length === 0 ? (
                  <p className="px-3 py-8 text-center text-[0.92rem] text-muted-foreground">
                    Nothing matches “{query}”.
                  </p>
                ) : (
                  <>
                    {commands.length > 0 && (
                      <Section label="In the panel">
                        {commands.map((entry, index) => (
                          <CommandRow
                            key={entry.id}
                            entry={entry}
                            active={active === index}
                            onHover={() => setActive(index)}
                            onSelect={() => choose(index)}
                          />
                        ))}
                      </Section>
                    )}

                    {/*
                      Grouped by where each row came from, so thirteen
                      tables answering at once reads as sections rather
                      than as one undifferentiated list.
                    */}
                    {grouped.map((group) => (
                      <Section key={group.label} label={group.label}>
                        {group.rows.map(({ record, flat }) => (
                          <RecordRow
                            key={group.label + record.label + flat}
                            record={record}
                            active={active === flat}
                            onHover={() => setActive(flat)}
                            onSelect={() => choose(flat)}
                          />
                        ))}
                      </Section>
                    ))}
                  </>
                )}
              </div>

              <div className="flex items-center gap-4 border-t border-foreground/[0.06] px-4 py-2 text-[0.8rem] text-muted-foreground">
                <Hint icon={<ArrowUp className="size-3" />} second={<ArrowDown className="size-3" />}>
                  navigate
                </Hint>
                <Hint icon={<CornerDownLeft className="size-3" />}>open</Hint>
                <span className="ml-auto font-mono">esc to close</span>
              </div>
            </motion.div>
          </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="px-3 py-1.5 text-[0.8rem] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function CommandRow({
  entry,
  active,
  onHover,
  onSelect,
}: {
  entry: CommandEntry;
  active: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  const Icon = entry.icon;

  return (
    <button
      onMouseEnter={onHover}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${
        active ? "bg-muted" :""
      }`}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.92rem]">{entry.title}</span>
        {entry.subtitle && (
          <span className="block truncate text-[0.86rem] text-muted-foreground">{entry.subtitle}</span>
        )}
      </span>
      {/* The group, not the kind: "Config" tells you where you are about to
          land, where"setting" only restates the icon. */}
      <span className="shrink-0 rounded border border-foreground/[0.06] px-1.5 py-0.5 text-[0.8rem] text-muted-foreground">
        {entry.group}
      </span>
    </button>
  );
}

/**
 * One row found in the database.
 *
 * Deliberately plainer than the command rows above it: a page is a
 * destination and gets an icon, a record is a thing and gets its name
 * plus whatever identifies it — an email, an address, a pattern.
 */
function RecordRow({
  record,
  active,
  onHover,
  onSelect,
}: {
  record: RecordHit;
  active: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  return (
    <button
      onMouseEnter={onHover}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${
        active ? "bg-muted" : ""
      }`}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-foreground/25" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.92rem]">{record.label}</span>
        {record.hint && (
          <span className="block truncate text-[0.86rem] text-muted-foreground">
            {record.hint}
          </span>
        )}
      </span>
    </button>
  );
}

function Hint({
  icon,
  second,
  children,
}: {
  icon: React.ReactNode;
  second?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1">
      <kbd className="rounded border border-foreground/[0.06] px-1 py-0.5">{icon}</kbd>
      {second && <kbd className="rounded border border-foreground/[0.06] px-1 py-0.5">{second}</kbd>}
      {children}
    </span>
  );
}
