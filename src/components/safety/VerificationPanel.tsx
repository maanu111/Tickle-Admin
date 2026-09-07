"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Check, RefreshCw, ScanFace, X } from "lucide-react";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { useConfirm } from "@/components/ui/confirm";
import {
  Pagination,
  paginate,
  usePagination,
} from "@/components/ui/pagination";
import { PagedList } from "@/components/ui/paged-list";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * Face verification, monitored rather than moderated.
 *
 * Every check is decided by Rekognition in a couple of seconds, and the
 * selfie is never stored — it exists in one request body and is gone. There
 * is nothing here to approve.
 *
 * What is here is the shape of the decisions. Two numbers matter: the
 * approval rate, which says whether the thresholds are set sensibly, and
 * the people stuck retrying, who are the only ones a human can still help.
 */

type Profile = {
  user_id: string;
  name: string | null;
  photos: string[] | null;
  face_verified_at: string | null;
} | null;

type LogRow = {
  id: string;
  user_id: string;
  similarity: number | null;
  approved: boolean;
  reason: string;
  compared: number;
  attempt: number;
  duration_ms: number | null;
  /** The profile photo that scored highest. Null when nothing matched. */
  matched_photo: string | null;
  created_at: string;
  profile: Profile;
};

type Stuck = { user_id: string; attempts: number; profile: Profile };

type Payload = {
  settings: {
    face_approve_at: number;
    face_reject_at: number;
    face_checks_per_hour: number;
  } | null;
  stats: {
    checks: number;
    approved: number;
    approvalRate: number;
    medianMs: number | null;
    medianSimilarity: number | null;
    providerErrors: number;
    stuck: number;
  };
  byReason: Record<string, number>;
  stuck: Stuck[];
  log: LogRow[];
};

/** Plain English, and what it means for the person it happened to. */
const REASON: Record<string, { label: string; tone: "good" | "bad" | "warn" }> =
  {
    match: { label: "Verified", tone: "good" },
    low_confidence: { label: "Close, not certain", tone: "warn" },
    no_match: { label: "Different person", tone: "bad" },
    no_face_in_selfie: { label: "No face in selfie", tone: "warn" },
    no_face_in_photos: { label: "No face in profile photos", tone: "warn" },
    no_photos: { label: "No profile photos", tone: "warn" },
    provider_error: { label: "AWS error", tone: "bad" },
    rate_limited: { label: "Rate limited", tone: "warn" },
  };

const TONE: Record<string, string> = {
  good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  warn: "border-orange-500/30 bg-orange-500/10 text-orange-600",
  bad: "border-destructive/30 bg-destructive/10 text-destructive",
};

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-US", {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export function VerificationPanel() {
  const confirm = useConfirm();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  // The check whose detail is open. Null when the sheet is closed.
  const [openLog, setOpenLog] = useState<LogRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<Payload>("/api/verification");

    if (error) setError(error);
    else setData(data);

    setLoading(false);
  }, []);

  useLoadOnMount(load);

  const override = useCallback(
    async (userId: string, approved: boolean) => {
      if (
        !(await confirm({
          title: approved
            ? "Verify this person by hand?"
            : "Remove their verified badge?",
          body: approved
            ? "Only when their photos genuinely cannot be matched and you have another reason to trust them. This is recorded against your name."
            : "They lose the badge on their profile. They can try verifying again.",
          confirmLabel: approved ? "Verify them" : "Remove badge",
          tone: approved ? "danger" : "default",
        }))
      ) {
        return;
      }

      setBusy(userId);

      const { error } = await adminFetch("/api/verification", {
        method: "POST",
        body: JSON.stringify({ user_id: userId, approved }),
      });

      if (error) setError(error);
      else await load();

      setBusy(null);
    },
    [load, confirm],
  );

  const visible = useMemo(
    () =>
      (data?.log ?? []).filter(
        (row) => filter === "all" || row.reason === filter,
      ),
    [data, filter],
  );

  const reasons = useMemo(
    () => Object.entries(data?.byReason ?? {}).sort((a, b) => b[1] - a[1]),
    [data],
  );

  // Resets when a filter shortens the list, so filtering while on a
  // later page cannot leave you looking at an empty one.
  const { page, setPage } = usePagination(visible.length);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <Button
          variant="outline"
          onClick={load}
          disabled={loading}
          className="border-foreground/[0.06] text-[0.86rem]"
        >
          <RefreshCw
            className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="border border-destructive/50 bg-destructive/10 p-4 text-[0.92rem] text-destructive">
          {error}
        </div>
      )}

      {loading || !data ? (
        <div className="py-16 text-center text-muted-foreground">
          Loading...
        </div>
      ) : data.stats.checks === 0 ? (
        <Card className="border-foreground/[0.06] bg-card">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ScanFace className="size-8 text-muted-foreground" />
            <p className="text-muted-foreground">No checks yet.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Stat
              label="Approved"
              value={`${data.stats.approvalRate}%`}
              note={`${data.stats.approved} of ${data.stats.checks}`}
              /* Below 50% usually means the threshold is too strict rather
                 than that half the members are impostors. */
              warn={data.stats.approvalRate < 50}
            />
            <Stat
              label="Typical face match"
              value={
                data.stats.medianSimilarity != null
                  ? `${data.stats.medianSimilarity}%`
                  : "-"
              }
              note={
                data.settings
                  ? `approve at ${data.settings.face_approve_at}%`
                  : undefined
              }
            />
            <Stat
              label="Typical wait for an answer"
              value={
                data.stats.medianMs != null ? `${data.stats.medianMs}ms` : "-"
              }
              warn={(data.stats.medianMs ?? 0) > 5000}
            />
            <Stat
              label="Stuck, keeps retrying"
              value={data.stats.stuck}
              note="3+ attempts, still unverified"
              warn={data.stats.stuck > 0}
            />
          </div>

          {data.stats.providerErrors > 0 && (
            <div className="flex items-center gap-3 border border-destructive/50 bg-destructive/10 p-4 text-[0.92rem] text-destructive">
              <AlertTriangle className="size-4 shrink-0" />
              {data.stats.providerErrors} AWS errors in the last 500 checks.
              Those attempts did not count against anyone.
            </div>
          )}

          {data.stuck.length > 0 && (
            <Card className="border-foreground/[0.06] bg-card">
              <CardHeader>
                <CardTitle className="text-base">Stuck retrying</CardTitle>
              </CardHeader>
              <CardContent>
                {/* The only place a human still adds anything. Three failures
                    usually means their profile photos are the problem — a
                    group shot, or one taken years ago. */}
                <div className="space-y-3">
                  <PagedList
                    items={data.stuck}
                    perPage={10}
                    className="space-y-3"
                  >
                    {(entry) => (
                      <div
                        key={entry.user_id}
                        className="flex items-center gap-3 border-b border-foreground/[0.06] pb-3 last:border-0 last:pb-0"
                      >
                        <Link href={`/members/${entry.user_id}`}>
                          <Avatar className="size-9 border border-foreground/[0.06] bg-transparent">
                            <AvatarImage
                              src={entry.profile?.photos?.[0] ?? undefined}
                            />
                            <AvatarFallback className="bg-transparent text-[0.86rem]">
                              {(entry.profile?.name ?? "?")
                                .slice(0, 2)
                                .toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                        </Link>

                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/members/${entry.user_id}`}
                            className="text-[0.92rem] font-medium hover:underline"
                          >
                            {entry.profile?.name ?? "Deleted account"}
                          </Link>
                          <p className="text-[0.86rem] text-muted-foreground">
                            {entry.attempts} attempts, no badge
                          </p>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy === entry.user_id}
                          onClick={() => override(entry.user_id, true)}
                          className="border-emerald-500/40 text-[0.86rem] text-emerald-600"
                        >
                          <Check className="mr-2 size-4" />
                          Verify anyway
                        </Button>
                      </div>
                    )}
                  </PagedList>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex w-fit flex-wrap border border-foreground/[0.06]">
            <TabButton
              active={filter === "all"}
              onClick={() => setFilter("all")}
            >
              All ({data.stats.checks})
            </TabButton>
            {reasons.map(([reason, count]) => (
              <TabButton
                key={reason}
                active={filter === reason}
                onClick={() => setFilter(reason)}
              >
                {REASON[reason]?.label ?? reason} ({count})
              </TabButton>
            ))}
          </div>

          <Card className="border-foreground/[0.06] bg-card">
            <CardHeader>
              <CardTitle>Recent checks</CardTitle>
              <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
                The most recent verification attempts and how each was decided.
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <>
                  {paginate(visible, page).map((row) => {
                    const meta = REASON[row.reason] ?? {
                      label: row.reason,
                      tone: "warn" as const,
                    };

                    return (
                      /*
                       * The whole row opens the check.
                       *
                       * A list of outcomes answers "what happened"; it
                       * cannot answer "why". The detail behind it shows
                       * the photo the selfie was actually scored
                       * against, which is the thing that explains a
                       * failure — usually the profile photo rather than
                       * the selfie.
                       */
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => setOpenLog(row)}
                        className="flex w-full items-center gap-3 border-b border-foreground/[0.06] pb-3 text-left transition-colors last:border-0 last:pb-0 hover:bg-foreground/[0.02]"
                      >
                        <Avatar className="size-9 border border-foreground/[0.06] bg-transparent">
                          <AvatarImage
                            src={row.profile?.photos?.[0] ?? undefined}
                          />
                          <AvatarFallback className="bg-transparent text-[0.86rem]">
                            {(row.profile?.name ?? "?")
                              .slice(0, 2)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>

                        <div className="min-w-0 flex-1">
                          <span className="text-[0.92rem] font-medium">
                            {row.profile?.name ?? "Deleted account"}
                          </span>
                          <p className="text-[0.86rem] text-muted-foreground">
                            Attempt {row.attempt}
                            {row.compared > 0 && ` · ${row.compared} photos`}
                            {row.duration_ms != null &&
                              ` · ${row.duration_ms}ms`}
                            {" · "}
                            {formatDateTime(row.created_at)}
                          </p>
                        </div>

                        {/* The score is shown here and nowhere the member can
                          see it — knowing you scored 74% is knowing how much
                          closer you need to get. */}
                        {row.similarity != null && (
                          <span className="w-14 text-right text-[0.92rem] tabular-nums text-muted-foreground">
                            {Math.round(row.similarity)}%
                          </span>
                        )}

                        <Badge
                          variant="outline"
                          className={`text-[0.8rem] ${TONE[meta.tone]}`}
                        >
                          {meta.label}
                        </Badge>
                      </button>
                    );
                  })}
                  <Pagination
                    page={page}
                    total={visible.length}
                    onPage={setPage}
                  />
                </>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <LogDetail
        row={openLog}
        onClose={() => setOpenLog(null)}
        busy={busy === openLog?.user_id}
        onDecide={async (userId, approved) => {
          await override(userId, approved);
          // Closed after the fact: the row it was showing is stale the
          // moment the decision lands, and leaving it open invites the
          // same button being pressed twice.
          setOpenLog(null);
        }}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-[0.86rem] font-medium transition-all duration-200 ${
        active
          ? "bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(26,26,24,0.18)]"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Stat({
  label,
  value,
  note,
  warn,
}: {
  label: string;
  value: number | string;
  note?: string;
  warn?: boolean;
}) {
  return (
    <Card className="border-foreground/[0.06] bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-[0.92rem] font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={`tnum text-[1.9rem] font-light tracking-tight ${warn ? "text-destructive" : ""}`}
        >
          {value}
        </div>
        {note && (
          <div className="text-[0.86rem] text-muted-foreground">{note}</div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * One check, in full.
 *
 * The list says what was decided; this says what it was decided from.
 * Two things it shows that a row cannot:
 *
 *   - The profile photo the selfie actually scored against. For an
 *     approval that makes the decision checkable by eye. For a failure
 *     it is usually the whole explanation — a group shot, sunglasses,
 *     a photo from ten years ago.
 *   - The score against the thresholds, so "68" reads as "below the
 *     line" rather than as a number needing a lookup.
 *
 * There is still no selfie here, and there never will be. It exists
 * inside one request and is written nowhere; what is stored is a photo
 * the member published on their own profile.
 */
function LogDetail({
  row,
  onClose,
  onDecide,
  busy,
}: {
  row: LogRow | null;
  onClose: () => void;
  onDecide: (userId: string, approved: boolean) => void;
  busy: boolean;
}) {
  if (!row) return null;

  const meta = REASON[row.reason] ?? { label: row.reason, tone: "warn" as const };
  const photos = row.profile?.photos ?? [];

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{row.profile?.name ?? "Deleted account"}</SheetTitle>
          <SheetDescription>
            Attempt {row.attempt} · {formatDateTime(row.created_at)}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 overflow-y-auto px-4 pb-6">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-[0.8rem] ${TONE[meta.tone]}`}>
              {meta.label}
            </Badge>
            {row.similarity != null && (
              <span className="text-[0.92rem] tabular-nums text-muted-foreground">
                {Math.round(row.similarity)}% similarity
              </span>
            )}
          </div>

          {/*
            The photo it matched against.
            
            Shown for failures as well as approvals — a rejection is
            usually about which photo scored best, not about the selfie,
            and this is the fastest way to see that.
          */}
          <div className="space-y-2">
            <h4 className="text-[0.86rem] font-medium">
              {row.approved ? "Verified against" : "Best match attempted"}
            </h4>

            {row.matched_photo ? (
              <div className="overflow-hidden rounded-lg border border-foreground/[0.06]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={row.matched_photo}
                  alt="The profile photo this check scored against"
                  className="aspect-[4/5] w-full object-cover"
                />
              </div>
            ) : (
              <p className="text-[0.86rem] text-muted-foreground">
                {row.compared === 0
                  ? "Nothing was compared — no usable profile photos, or the check never reached the provider."
                  : "Not recorded. This check ran before the matched photo was stored."}
              </p>
            )}
          </div>

          {/*
            The rest of their photos, for context.

            The one that scored best is only meaningful next to the ones
            that did not — three group shots and one clear portrait is a
            profile whose owner should be told to reorder it.
          */}
          {photos.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[0.86rem] font-medium">
                Their profile photos ({photos.length})
              </h4>
              <div className="grid grid-cols-3 gap-2">
                {photos.map((photo) => (
                  <div
                    key={photo}
                    className={`overflow-hidden rounded-md border ${
                      photo === row.matched_photo
                        ? "border-foreground/40 ring-1 ring-foreground/20"
                        : "border-foreground/[0.06]"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo}
                      alt=""
                      className="aspect-square w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <dl className="space-y-2 text-[0.86rem]">
            <Row label="Photos compared" value={String(row.compared)} />
            <Row
              label="Decided in"
              value={row.duration_ms != null ? `${row.duration_ms}ms` : "—"}
            />
            <Row
              label="Profile status"
              value={
                row.profile?.face_verified_at
                  ? `Verified ${formatDateTime(row.profile.face_verified_at)}`
                  : "Not verified"
              }
            />
          </dl>

          {/*
            The decision, on the screen that explains it.

            This sheet was read-only: it showed the selfie, the photo it
            was scored against and the score, and then offered no way to
            act on any of it. Overriding a check meant leaving, finding
            the person in Members and doing it there — away from the
            evidence you had just been looking at.

            Both directions are here because both are real. A machine
            that says no to somebody who is plainly themselves needs
            overriding; so does a badge that should not have been given.
          */}
          <div className="flex flex-wrap gap-2 border-t border-foreground/[0.06] pt-4">
            {row.profile?.face_verified_at ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => onDecide(row.user_id, false)}
                className="border-destructive/40 text-[0.86rem] text-destructive"
              >
                <X className="mr-2 size-4" />
                Remove their badge
              </Button>
            ) : (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => onDecide(row.user_id, true)}
                className="border-emerald-500/40 text-[0.86rem] text-emerald-600"
              >
                <Check className="mr-2 size-4" />
                Verify them anyway
              </Button>
            )}

            <Link
              href={`/members/${row.user_id}`}
              className="inline-flex items-center text-[0.86rem] underline underline-offset-4"
            >
              Open their profile
            </Link>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** One label/value pair in the detail list. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );
}
