"use client";
import { Suspense, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Ban, CheckCircle2, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { Pagination, paginate, usePagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/page";
import { PageSkeleton } from "@/components/ui/page";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { useConfirm, useAskReason } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { PageHeader, Explainer } from "@/components/ui/page";
import { Segmented } from "@/components/ui/select";
import { QueuePanel } from "@/components/safety/QueuePanel";
import { SafetyRulesPanel } from "@/components/safety/SafetyRulesPanel";
import { TicketsPanel } from "@/components/safety/TicketsPanel";
import { VerificationPanel } from "@/components/safety/VerificationPanel";
import { DailiesPanel } from "@/components/safety/DailiesPanel";

/**
 * The moderation queue.
 *
 * Reports arrive from the app write-once — someone files one and it sits
 * there. What makes this a queue rather than a log is the status column 010
 * added, and the rule that every report leaves the queue through a person:
 * resolved because something was done, or dismissed because nothing needed
 * to be.
 *
 * The count next to a name is the number that changes a decision. One report
 * is an incident; the same account reported five times by five people is a
 * pattern, and that is invisible reading the queue a row at a time.
 */

type ProfileRef = {
  user_id: string;
  name: string | null;
  email: string | null;
  photos: string[] | null;
  suspended_at: string | null;
  suspended_reason: string | null;
};

type ReportRow = {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  match_id: string | null;
  reason: string;
  status: string;
  notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  reporter: ProfileRef | null;
  reported: ProfileRef | null;
  times_reported: number;
};

const STATUS_STYLES: Record<string, string> = {
  open: "border-destructive/30 bg-destructive/10 text-destructive",
  reviewing: "border-orange-500/30 bg-orange-500/10 text-orange-600",
  resolved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  dismissed: "border-foreground/[0.06] bg-muted text-muted-foreground",
};

const TABS: { key: string; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "reviewing", label: "Reviewing" },
  { key: "resolved", label: "Resolved" },
  { key: "dismissed", label: "Dismissed" },
  { key: "all", label: "All" },
];

function formatDateTime(value: string | null) {
  if (!value) return "-";
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

function nameOf(profile: ProfileRef | null) {
  return profile?.name || profile?.email || "Deleted account";
}

function initialsOf(profile: ProfileRef | null) {
  return nameOf(profile)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function SafetyPage() {
  // useSearchParams bails out of prerendering up to the nearest boundary, and
  // a production build fails outright without one.
  return (
    <Suspense
      fallback={<PageSkeleton sections={2} />}
    >
      <SafetyView />
    </Suspense>
  );
}

type View = "reports" | "patterns" | "tickets" | "verification" | "dailies";

const VIEWS: { value: View; label: string }[] = [
  { value: "reports", label: "Reports" },
  { value: "verification", label: "Verification" },
  { value: "dailies", label: "Today's posts" },
  { value: "tickets", label: "Tickets" },
  { value: "patterns", label: "Patterns" },
];

/*
 * "Waiting" was a sixth view, and it showed the same reports as this
 * one — /api/moderation filtered to open, beside /api/reports filtered
 * to open. Two tabs, one queue, two different sets of buttons over it:
 * the Waiting version demanded a written reason before it would act,
 * this one did not. Whichever tab you happened to open decided whether
 * the audit trail got an explanation.
 *
 * They are one view now, with the deciding tool on top and the log
 * under it, so a decision and its history are the same screen.
 */
const MOVED: Record<string, View> = { queue: "reports" };

const BLURB: Record<View, string> = {
  reports: "Reports waiting for a decision, and everything already decided.",
  patterns: "Scam messages and dodgy links the app watches for.",
  tickets: "Support messages from members, and the replies sent back.",
  verification: "Members proving they match their photos. Selfies are never kept.",
  dailies: "Posts from today. All of it disappears within 24 hours.",
};

function SafetyView() {
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const [view, setView] = useState<View>(() => {
    /*
     * Checked against the list rather than against three names.
     *
     * This tested for "queue", "patterns" and "tickets" only, so
     * ?view=verification and ?view=dailies both fell through to
     * reports — two of the six views were unreachable by link, and the
     * command palette links to both.
     */
    const asked = searchParams.get("view") ?? "";
    if (VIEWS.some((entry) => entry.value === asked)) return asked as View;
    return MOVED[asked] ?? "reports";
  });
  const askReason = useAskReason();
  const toast = useToast();

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<string>(() => {
    // The palette links here as /safety?filter=open.
    const requested = searchParams.get("filter");
    return requested && TABS.some((entry) => entry.key === requested) ? requested :"open";
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<{ reports: ReportRow[] }>("/api/reports");

    if (error) setError(error);
    else setReports(data?.reports ?? []);

    setLoading(false);
  }, []);

  useLoadOnMount(load);

  const setStatus = useCallback(
    async (report: ReportRow, status: string) => {
      setBusy(true);
      const { error } = await adminFetch("/api/reports", {
        method: "PATCH",
        body: JSON.stringify({ id: report.id, status, notes: report.notes ??"" }),
      });
      if (error) setError(error);
      await load();
      setBusy(false);
    },
    [load],
  );

  const toggleSuspend = useCallback(
    async (profile: ProfileRef) => {
      const suspended = Boolean(profile.suspended_at);

      const reason = suspended
        ? null
        : window.prompt(`Suspend ${nameOf(profile)}. Reason?`, "");

      // A null reason means the prompt was cancelled, not that the reason was
      // left blank — an empty string is a deliberate"no reason given".
      if (!suspended && reason === null) return;

      setBusy(true);
      const { error } = await adminFetch("/api/reports", {
        method: "POST",
        body: JSON.stringify({
          action: suspended ? "unsuspend" :"suspend",
          user_id: profile.user_id,
          reason,
        }),
      });
      if (error) setError(error);
      await load();
      setBusy(false);
    },
    [load],
  );

  const forceLogout = useCallback(
    async (profile: ProfileRef) => {
      if (
        !(await confirm({
          title: `Sign ${nameOf(profile)} out everywhere?`,
          body: "For an account somebody else has got into — not as a punishment. They can sign back in straight away.",
          confirmLabel: "Sign them out",
        }))
      ) {
        return;
      }

      setBusy(true);
      const { error } = await adminFetch("/api/reports", {
        method: "POST",
        body: JSON.stringify({ action: "force_logout", user_id: profile.user_id }),
      });
      if (error) setError(error);
      setBusy(false);
    },
    [confirm],
  );

  const onModerate = useCallback(
    async (
      report: ReportRow,
      action: "warn" | "reverify" | "ban",
      copy: { title: string; body: string; confirmLabel: string; danger?: boolean },
    ) => {
      const why = await askReason({
        title: copy.title,
        body: copy.body,
        confirmLabel: copy.confirmLabel,
        tone: copy.danger ? "danger" : "default",
        reason: {
          label: "Why?",
          placeholder: "What they did, and what you checked.",
        },
      });

      if (!why) return;

      setBusy(true);

      const { error } = await adminFetch("/api/moderation", {
        method: "POST",
        body: JSON.stringify({ report_id: report.id, action, reason: why }),
      });

      if (error) {
        setError(error);
        toast.error({ title: "Could not do that", body: error });
      } else {
        toast.success({ title: copy.confirmLabel + " — done" });
        await load();
      }

      setBusy(false);
    },
    [askReason, load, toast],
  );

  const stats = useMemo(() => {
    const open = reports.filter((row) => row.status === "open").length;
    const reviewing = reports.filter((row) => row.status === "reviewing").length;
    const suspended = new Set(
      reports.filter((row) => row.reported?.suspended_at).map((row) => row.reported_user_id),
    ).size;
    const repeat = new Set(
      reports.filter((row) => row.times_reported >= 3).map((row) => row.reported_user_id),
    ).size;

    return { open, reviewing, suspended, repeat };
  }, [reports]);

  const visible = useMemo(
    () => (tab === "all" ? reports : reports.filter((row) => row.status === tab)),
    [reports, tab],
  );

  // Resets when a filter shortens the list, so filtering while on a
  // later page cannot leave you staring at an empty one.
  const { page, setPage } = usePagination(visible.length);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Moderation"
        description="Reports, decisions, warning patterns and tickets."
        actions={
          <>
            <Segmented value={view} onChange={setView} options={VIEWS} />
            {view === "reports" && (
              <Button variant="secondary" onClick={load} disabled={loading}>
                <RefreshCw className={loading ? "animate-spin" : undefined} />
                Refresh
              </Button>
            )}
          </>
        }
      />

      <Explainer>{BLURB[view]}</Explainer>

      {view === "patterns" && <SafetyRulesPanel />}
      {view === "tickets" && <TicketsPanel />}
      {view === "verification" && <VerificationPanel />}
      {view === "dailies" && <DailiesPanel />}

      {view === "reports" && (
        <>
          {/*
            The deciding tool first, the history under it.

            This is where a moderator actually works: the queue refuses
            to act without a written reason, which is the only thing
            that explains a suspension to whoever reads the audit trail
            months later. The log below is the same reports with their
            outcomes — useful for looking something up, but not where a
            decision should be made, because it never asked why.
          */}
          <QueuePanel />

          <div className="border-t border-foreground/[0.06] pt-6">
            <h3 className="text-[0.92rem] font-bold">Everything reported</h3>
            <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
              The full history, including what was already decided.
            </p>
          </div>


      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-destructive/20 bg-destructive/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-[0.92rem] font-medium text-destructive">Waiting</CardTitle>
            <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
              Reports nobody has decided on yet. This is the part that needs a person.
            </p>
          </CardHeader>
          <CardContent className="tnum text-[1.9rem] font-light tracking-tight text-destructive">
            {stats.open}
          </CardContent>
        </Card>
        <Stat label="Being looked at" value={stats.reviewing} />
        <Stat label="Reported 3 or more times" value={stats.repeat} />
        <Stat label="Suspended" value={stats.suspended} />
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/8 px-3.5 py-2.5 text-[0.92rem] text-destructive">
          {error}
        </div>
      )}

      <div className="flex w-fit flex-wrap border border-foreground/[0.06]">
        {TABS.map((entry) => {
          const count =
            entry.key === "all"
              ? reports.length
              : reports.filter((row) => row.status === entry.key).length;

          return (
            <button
              key={entry.key}
              onClick={() => setTab(entry.key)}
              className={`rounded-full px-3.5 py-1.5 text-[0.86rem] font-medium transition-all duration-200 ${
                tab === entry.key
                  ? "bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(26,26,24,0.18)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {entry.label}
              {count > 0 && ` (${count})`}
            </button>
          );
        })}
      </div>

      <Card className="border-foreground/[0.06] bg-card">
        <CardHeader>
          <CardTitle>Reports</CardTitle>
          <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
            Everything that has been reported, including the ones already dealt with.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <PageSkeleton sections={2} />
          ) : visible.length === 0 ? (
            <EmptyState
              title={tab === "open" ? "Nothing waiting" : "No reports here"}
              body={
                tab === "open"
                  ? "Every report has been dealt with."
                  : "Nothing has been reported that matches this filter."
              }
            />
          ) : (
            <div className="space-y-6">
              {paginate(visible, page).map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  busy={busy}
                  onStatus={setStatus}
                  onModerate={onModerate}
                  onToggleSuspend={toggleSuspend}
                  onForceLogout={forceLogout}
                />
              ))}
            <Pagination page={page} total={visible.length} onPage={setPage} />
            </div>
          )}
        </CardContent>
      </Card>
        </>
      )}
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

function ReportCard({
  report,
  busy,
  onStatus,
  onModerate,
  onToggleSuspend,
  onForceLogout,
}: {
  report: ReportRow;
  busy: boolean;
  onStatus: (report: ReportRow, status: string) => void;
  onModerate: (
    report: ReportRow,
    action: "warn" | "reverify" | "ban",
    copy: { title: string; body: string; confirmLabel: string; danger?: boolean },
  ) => void;
  onToggleSuspend: (profile: ProfileRef) => void;
  onForceLogout: (profile: ProfileRef) => void;
}) {
  const suspended = Boolean(report.reported?.suspended_at);
  const open = report.status === "open" || report.status === "reviewing";

  return (
    <div className="space-y-3 border-b border-foreground/[0.06] pb-6 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/members/${report.reported_user_id}`}>
          <Avatar className="h-11 w-11 border border-foreground/[0.06] bg-transparent">
            <AvatarImage src={report.reported?.photos?.[0] ?? undefined} />
            <AvatarFallback className="bg-transparent text-[0.86rem]">
              {initialsOf(report.reported)}
            </AvatarFallback>
          </Avatar>
        </Link>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[0.92rem] font-medium">
            {nameOf(report.reported)}
            {report.times_reported >= 3 && (
              <Badge
                variant="outline"
                className="border-destructive/30 bg-destructive/10 text-[0.86rem] text-destructive"
              >
                <AlertTriangle className="mr-1 size-3" />
                {report.times_reported} reports
              </Badge>
            )}
            {suspended && (
              <Badge
                variant="outline"
                className="border-foreground/[0.06] bg-muted text-[0.86rem] text-muted-foreground"
              >
                Suspended
              </Badge>
            )}
          </p>
          <p className="text-[1rem] leading-relaxed text-muted-foreground">
            Reported by {nameOf(report.reporter)} ·{""}
            {formatDateTime(report.created_at)}
          </p>
        </div>

        <Badge
          variant="outline"
          className={`text-[0.86rem] ${
            STATUS_STYLES[report.status] ??""
          }`}
        >
          {report.status}
        </Badge>
      </div>

      <p className="border-l-2 border-foreground/[0.06] pl-3 text-[0.92rem]">{report.reason}</p>

      {report.reviewed_at && (
        <p className="text-[1rem] leading-relaxed text-muted-foreground">
          Reviewed {formatDateTime(report.reviewed_at)}
          {report.notes ? ` — ${report.notes}` :""}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {open && (
          <>
            {report.status === "open" && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => onStatus(report, "reviewing")}
                className="border-foreground/[0.06] text-[0.86rem]"
              >
                Pick up
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onStatus(report, "resolved")}
              className="border-foreground/[0.06] text-[0.86rem]"
            >
              <CheckCircle2 className="mr-2 size-4" />
              Resolve
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onStatus(report, "dismissed")}
              className="border-foreground/[0.06] text-[0.86rem]"
            >
              Dismiss
            </Button>
          </>
        )}

        {report.reported && (
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() =>
                onModerate(report, "warn", {
                  title: "Send a warning?",
                  body: "They get a notification telling them what was reported. Nothing else changes.",
                  confirmLabel: "Warn them",
                })
              }
            >
              Warn
            </Button>

            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() =>
                onModerate(report, "reverify", {
                  title: "Make them verify again?",
                  body: "Their verified badge is removed until they pass a new photo check. Use it when you doubt the account is who it claims to be.",
                  confirmLabel: "Require it",
                })
              }
            >
              Re-verify
            </Button>
          </>
        )}

        {report.reported && !suspended && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onForceLogout(report.reported!)}
            title="Sign out everywhere"
            className="border-foreground/[0.06] text-[0.86rem]"
          >
            <LogOut className="mr-2 size-4" />
            Force logout
          </Button>
        )}

        {report.reported && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onToggleSuspend(report.reported!)}
            className={`text-[0.86rem] ${
              suspended
                ? "border-foreground/[0.06]"
                :"border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
            }`}
          >
            {suspended ? (
              <>
                <ShieldCheck className="mr-2 size-4" />
                Restore
              </>
            ) : (
              <>
                <Ban className="mr-2 size-4" />
                Suspend
              </>
            )}
          </Button>
        )}

        {report.reported && (
          <Button
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() =>
              onModerate(report, "ban", {
                title: `Ban ${nameOf(report.reported)}?`,
                body: "Permanent. They lose the account and cannot sign in again. Suspension is the reversible version of this.",
                confirmLabel: "Ban permanently",
                danger: true,
              })
            }
          >
            Ban
          </Button>
        )}
      </div>
    </div>
  );
}
