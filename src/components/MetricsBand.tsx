"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { useLiveTable } from "@/lib/useLiveTable";

type Revenue = {
  gross_minor: number;
  net_minor: number;
  refunded_minor: number;
  hearts_gross_minor: number;
  premium_gross_minor: number;
  hearts_sales: number;
  premium_sales: number;
  arpu_minor: number;
  arppu_minor: number;
  payers: number;
  unattributed: number;
};

type Metrics = {
  range: { from: string; to: string; key: string };
  revenue: Revenue | null;
  active: { dau: number; wau: number; mau: number };
  members: {
    total: number;
    new: number;
    published: number;
    verified: number;
    premium: number;
  };
  activity: { matches: number; messages: number; likes: number };
  attention: { reports: number; tickets: number; uncredited: number };
  windows: string[];
};

const RANGE_LABELS: Record<string, string> = {
  today: "Today",
  week: "7 days",
  month: "30 days",
  quarter: "90 days",
  year: "Year",
};

const money = (minor: number | undefined) =>
  `₹${((minor ?? 0) / 100).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;

function Figure({
  label,
  value,
  hint,
  href,
  alert,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  alert?: boolean;
}) {
  const inner = (
    <Card
      className={`border bg-card ${
        alert ? "border-destructive/50" :"border-foreground/[0.06]"
      } ${href ? "transition-colors hover:bg-accent" :""}`}
    >
      <CardContent className="p-4">
        <p className="text-[0.86rem] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`mt-1 text-[1.6rem] font-medium tracking-tight ${alert ? "text-destructive" :""}`}>
          {value}
        </p>
        {hint && <p className="mt-1 text-[0.86rem] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );

  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function MetricsBand() {
  const [data, setData] = useState<Metrics | null>(null);
  const [range, setRange] = useState("week");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await adminFetch<Metrics>(`/api/metrics?range=${range}`);

    if (error) setError(error);
    else {
      setData(data ?? null);
      setError(null);
    }
  }, [range]);

  useLoadOnMount(load);

  // Counts at the top of the dashboard. Stale numbers here are the
  // quietest kind of wrong — nothing looks broken, the figures are just
  // from whenever the page was opened.
  useLiveTable(
    ["profiles", "reports", "support_tickets", "purchase_attempts"],
    load,
  );

  if (error) {
    return <p className="text-[0.92rem] text-destructive">{error}</p>;
  }

  if (!data) {
    return <p className="text-[0.92rem] text-muted-foreground">Counting…</p>;
  }

  const { revenue, active, members, activity, attention } = data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1">
        {data.windows.map((entry) => (
          <Button
            key={entry}
            variant={range === entry ? "default" :"outline"}
            size="sm"
            onClick={() => setRange(entry)}
          >
            {RANGE_LABELS[entry] ?? entry}
          </Button>
        ))}
      </div>

      {/* What somebody has to act on, first and separately from what
          they are only watching. */}
      {(attention.reports > 0 || attention.tickets > 0 || attention.uncredited > 0) && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Figure
            label="Open reports"
            value={attention.reports}
            href="/queue"
            alert={attention.reports > 0}
          />
          <Figure
            label="Open tickets"
            value={attention.tickets}
            href="/tickets"
            alert={attention.tickets > 0}
          />
          <Figure
            label="Paid but not received"
            value={attention.uncredited}
            hint="Someone was charged and never got it"
            alert={attention.uncredited > 0}
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Net revenue"
          value={money(revenue?.net_minor)}
          hint={
            revenue?.refunded_minor
              ? `${money(revenue.gross_minor)} gross · ${money(revenue.refunded_minor)} refunded`
              : `${money(revenue?.gross_minor)} gross`
          }
        />
        <Figure
          label="Hearts"
          value={money(revenue?.hearts_gross_minor)}
          hint={`${revenue?.hearts_sales ?? 0} sales`}
        />
        <Figure
          label="Premium"
          value={money(revenue?.premium_gross_minor)}
          hint={`${revenue?.premium_sales ?? 0} sales`}
        />
        <Figure
          label="ARPPU"
          value={money(revenue?.arppu_minor)}
          hint={`${revenue?.payers ?? 0} payers · ARPU ${money(revenue?.arpu_minor)}`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="DAU" value={active.dau} hint="Active in 24h" />
        <Figure label="WAU" value={active.wau} hint="Active in 7 days" />
        <Figure label="MAU" value={active.mau} hint="Active in 30 days" />
        <Figure
          label="New members"
          value={members.new}
          hint={`${members.total} total`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Figure label="Published" value={members.published} />
        <Figure label="Verified" value={members.verified} />
        <Figure label="Premium" value={members.premium} hint="Right now" />
        <Figure label="Matches" value={activity.matches} />
        <Figure label="Messages" value={activity.messages} />
      </div>
      {(revenue?.unattributed ?? 0) > 0 && (
        <p className="text-[1rem] leading-relaxed text-muted-foreground">
          {revenue?.unattributed} purchase
          {revenue?.unattributed === 1 ? "" :"s"} in this window have no price
          recorded and are not counted in revenue.
        </p>
      )}
    </div>
  );
}
