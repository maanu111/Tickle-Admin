"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Pagination, paginate, usePagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/page";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { useLiveTable } from "@/lib/useLiveTable";

/**
 * The moderation queue.
 *
 * Every action needs a reason before the buttons enable. That is not
 * friction for its own sake — the reason is the only thing that explains
 * a suspension to whoever reads the audit trail in three months,
 * including the person who made it.
 *
 * The reporter is never shown. The API does not return it and this page
 * could not display it if it wanted to: a moderator deciding a case does
 * not need to know who raised it, and a panel that shows it is one
 * screenshot away from somebody being identified.
 */

type Report = {
  id: string;
  reported_user_id: string;
  reason: string;
  reason_key: string;
  detail: string | null;
  status: string;
  created_at: string;
  report_count: number;
  profile: {
    user_id: string;
    name: string | null;
    email: string | null;
    photos: string[] | null;
    suspended_at: string | null;
    face_verified_at: string | null;
    created_at: string;
  } | null;
};

type Reason = { key: string; label: string; severity: number; urgent: boolean };

type Flag = {
  id: string;
  owner_id: string;
  kind: string;
  reason: string | null;
  target_path: string | null;
  created_at: string;
};

type Payload = {
  reports: Report[];
  reasons: Reason[];
  flags: Flag[];
  actions: string[];
};

const ACTION_LABELS: Record<string, string> = {
  dismiss: "Nothing wrong",
  warn: "Warn them",
  reverify: "Ask them to verify again",
  suspend: "Suspend",
  unsuspend: "Lift suspension",
  ban: "Ban",
};

export function QueuePanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("open");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<Payload>(`/api/moderation?status=${status}`);

    if (error) setError(error);
    else setData(data ?? null);

    setLoading(false);
  }, [status]);

  useLoadOnMount(load);

  // A moderator sits on this screen waiting for work to arrive. Without
  // this the queue is whatever it was when the page opened, and a report
  // filed a minute ago is invisible until somebody thinks to refresh.
  useLiveTable(["reports", "content_flags"], load);

  const act = useCallback(
    async (reportId: string, action: string) => {
      const reason = reasons[reportId]?.trim() ??"";

      if (reason.length < 3) {
        setError("Say why before acting. It is what explains this later.");
        return;
      }

      setBusy(reportId);
      setError(null);

      const { error } = await adminFetch("/api/moderation", {
        method: "POST",
        body: JSON.stringify({ report_id: reportId, action, reason }),
      });

      if (error) setError(error);
      else {
        setReasons((current) => {
          const next = { ...current };
          delete next[reportId];
          return next;
        });
        await load();
      }

      setBusy(null);
    },
    [reasons, load],
  );

  const severityOf = (key: string) =>
    data?.reasons.find((r) => r.key === key)?.severity ?? 2;

  const isUrgent = (key: string) =>
    data?.reasons.find((r) => r.key === key)?.urgent ?? false;

  // Urgent first, then repeat offenders, then age.
  const sorted = [...(data?.reports ?? [])].sort((a, b) => {
    const urgency = Number(isUrgent(b.reason_key)) - Number(isUrgent(a.reason_key));
    if (urgency !== 0) return urgency;

    const severity = severityOf(b.reason_key) - severityOf(a.reason_key);
    if (severity !== 0) return severity;

    return b.report_count - a.report_count;
  });

  // Resets when a filter shortens the list, so filtering while on a
  // later page cannot leave you staring at an empty one.
  const { page, setPage } = usePagination(sorted.length);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          {["open", "actioned", "dismissed"].map((entry) => (
            <Button
              key={entry}
              variant={status === entry ? "default" :"outline"}
              size="sm"
              onClick={() => setStatus(entry)}
            >
              {entry}
            </Button>
          ))}
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

      {paginate(sorted, page).map((report) => {
        const urgent = isUrgent(report.reason_key);
        const repeat = report.report_count > 1;

        return (
          <Card key={report.id} className={urgent ? "border-destructive/40" : undefined}>
            <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">
                    {report.profile?.name ??"Unknown"}
                  </CardTitle>

                  {urgent && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      urgent
                    </Badge>
                  )}

                  {/* One report is an incident. Five is a pattern, and a
                      moderator seeing one case cannot tell the difference
                      without this. */}
                  {repeat && (
                    <Badge variant="secondary">
                      reported {report.report_count} times
                    </Badge>
                  )}

                  {report.profile?.suspended_at && (
                    <Badge variant="outline">already suspended</Badge>
                  )}

                  {!report.profile?.face_verified_at && (
                    <Badge variant="outline">unverified</Badge>
                  )}
                </div>

                <p className="mt-1 text-[0.92rem] font-medium">{report.reason}</p>

                {report.detail && (
                  <p className="mt-1 whitespace-pre-wrap text-[0.92rem] text-muted-foreground">
                    {report.detail}
                  </p>
                )}

                <p className="mt-2 text-[0.86rem] text-muted-foreground">
                  {new Date(report.created_at).toLocaleString()}
                  {report.profile && (
                    <>
                      {" ·"}
                      <Link
                        href={`/members/${report.reported_user_id}`}
                        className="underline hover:text-foreground"
                      >
                        open profile
                      </Link>
                    </>
                  )}
                </p>
              </div>

              {report.profile?.photos?.[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={report.profile.photos[0]}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded object-cover"
                />
              )}
            </CardHeader>

            {status === "open" && (
              <CardContent className="space-y-3">
                <Input
                  value={reasons[report.id] ??""}
                  onChange={(event) =>
                    setReasons((current) => ({ ...current, [report.id]: event.target.value }))
                  }
                  placeholder="Why — recorded against your name"
                  className="text-[0.92rem]"
                />

                <div className="flex flex-wrap gap-2">
                  {(data?.actions ?? []).map((action) => {
                    // Only one of suspend/unsuspend applies at a time.
                    if (action === "unsuspend" && !report.profile?.suspended_at) return null;
                    if (
                      (action === "suspend" || action === "ban") &&
                      report.profile?.suspended_at
                    ) {
                      return null;
                    }

                    const destructive = ["suspend", "ban"].includes(action);

                    return (
                      <Button
                        key={action}
                        variant={destructive ? "destructive" :"outline"}
                        size="sm"
                        disabled={busy === report.id || (reasons[report.id]?.trim().length ?? 0) < 3}
                        onClick={() => act(report.id, action)}
                      >
                        {ACTION_LABELS[action] ?? action}
                      </Button>
                    );
                  })}
                </div>
                <Pagination page={page} total={sorted.length} onPage={setPage} />
              </CardContent>
            )}
          </Card>
        );
      })}

      {sorted.length === 0 && !loading && (
        <Card>
          <CardContent>
            <EmptyState
              title="Nothing waiting"
              body="Every report has been dealt with. New ones appear here as members file them."
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
