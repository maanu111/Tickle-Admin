"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MapPin, RefreshCw, Search, Timer, Trash2 } from "lucide-react";
import { HeartSettingsPanel } from "@/components/hearts/HeartSettingsPanel";
import { EmptyState } from "@/components/ui/page";
import { PageSkeleton } from "@/components/ui/page";
import { Pagination, paginate, usePagination } from "@/components/ui/pagination";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { HuntPanel } from "@/components/hearts/HuntPanel";

/**
 * Hearts left at venues, and the sparks they turned into.
 *
 * Three numbers matter here and"how many hearts exist" is not one of them.
 * What counts is how many are live, how many were picked up, and how many
 * expired unclaimed — because a feature where people drop hearts nobody ever
 * finds fails quietly, and only the ratio between those three shows it.
 *
 * Read through /api/hearts rather than straight from Supabase: RLS on both
 * tables is written from the member's point of view — you see your own
 * hearts and nobody else's — so a client-side query here would come back
 * empty no matter who is signed in.
 */

type HeartRow = {
  id: string;
  dropper_id: string;
  place_id: string;
  note: string | null;
  vibe: string | null;
  status: string;
  created_at: string;
  expires_at: string;
};

type PlaceRow = {
  id: string;
  name: string;
  category: string | null;
};

type ProfileRow = {
  user_id: string;
  name: string | null;
  email: string | null;
  photos: string[] | null;
};

type SparkRow = {
  id: string;
  heart_id: string;
  place_id: string;
  dropper_id: string;
  picker_id: string;
  created_at: string;
  expires_at: string;
  removed_by: string | null;
};

type HeartView = HeartRow & { place: PlaceRow | null; dropper: ProfileRow | null };

type SparkView = SparkRow & {
  place: PlaceRow | null;
  dropper: ProfileRow | null;
  picker: ProfileRow | null;
};

const STATUS_STYLES: Record<string, string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  claimed: "border-blue-500/30 bg-blue-500/10 text-blue-600",
  expired: "border-foreground/[0.06] bg-muted text-muted-foreground",
  withdrawn: "border-orange-500/30 bg-orange-500/10 text-orange-600",
};

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

/*
 * The route resolves a name for every id before the page sees it — the
 * profile's own, then the auth record's email or phone, and "Unnamed
 * member" when the account carries none of them. The uuid that used to be
 * drawn here is not a name and never was, so it is not a fallback either.
 */
function getName(profile: ProfileRow | null) {
  return profile?.name || profile?.email || "Deleted account";
}

function getInitials(profile: ProfileRow | null) {
  return getName(profile)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function HeartsPage() {
  // useSearchParams bails out of prerendering up to the nearest boundary, and
  // a production build fails outright without one.
  return (
    <Suspense
      fallback={<PageSkeleton sections={2} />}
    >
      <HeartsView />
    </Suspense>
  );
}

function HeartsView() {
  const searchParams = useSearchParams();

  const [hearts, setHearts] = useState<HeartView[]>([]);
  const [loadedAt, setLoadedAt] = useState(0);
  const [sparks, setSparks] = useState<SparkView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  /*
   * Checked against all four tabs, not just one.
   *
   * This tested only for "settings", so ?tab=hunt and ?tab=sparks both
   * landed on Hearts — and the command palette links to Heart Hunt by
   * exactly that URL. The link worked, went to the right page, and
   * showed the wrong tab, which is the hardest kind of broken to spot.
   */
  const [tab, setTab] = useState<"hearts" | "sparks" | "hunt" | "settings">(() => {
    const asked = searchParams.get("tab") ?? "";
    return asked === "sparks" || asked === "hunt" || asked === "settings"
      ? asked
      : "hearts";
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<{ hearts: HeartView[]; sparks: SparkView[] }>("/api/hearts",
    );

    if (error) {
      setError(error);
    } else {
      setHearts(data?.hearts ?? []);
      // The instant this snapshot is true as of. Set with the rows so a
      // heart cannot appear live against a clock newer than the data.
      setLoadedAt(Date.now());
      setSparks(data?.sparks ?? []);
    }

    setLoading(false);
  }, []);

  useLoadOnMount(load);

  const expireNow = useCallback(async () => {
    setBusy(true);
    // The same sweep pg_cron runs every ten minutes. Exposed because waiting
    // ten minutes to see the effect of a settings change is the kind of
    // friction that stops anyone checking at all.
    const { error } = await adminFetch("/api/hearts", {
      method: "POST",
      body: JSON.stringify({ action: "expire" }),
    });
    if (error) setError(error);
    await load();
    setBusy(false);
  }, [load]);

  // The palette links here as /hearts?action=expire, so arriving that way has
  // to actually run the sweep rather than just landing on the page.
  const wantsExpire = searchParams.get("action") === "expire";
  const sweptOnArrival = useRef(false);

  useEffect(() => {
    if (!wantsExpire || sweptOnArrival.current) return;
    sweptOnArrival.current = true;

    void Promise.resolve().then(() => {
      void expireNow();
    });
  }, [wantsExpire, expireNow]);

  const withdraw = useCallback(
    async (heartId: string) => {
      setBusy(true);
      const { error } = await adminFetch("/api/hearts", {
        method: "POST",
        body: JSON.stringify({ action: "withdraw", id: heartId }),
      });
      if (error) setError(error);
      await load();
      setBusy(false);
    },
    [load],
  );

  const stats = (() => {
    const now = loadedAt;

    const live = hearts.filter(
      (row) => row.status === "active" && new Date(row.expires_at).getTime() > now,
    ).length;
    const claimed = hearts.filter((row) => row.status === "claimed").length;
    const expired = hearts.filter((row) => row.status === "expired").length;
    const settled = claimed + expired;

    return {
      live,
      claimed,
      expired,
      // The number that says whether the feature works: of the hearts that
      // reached an end state, how many found someone.
      pickupRate: settled > 0 ? Math.round((claimed / settled) * 100) : 0,
    };
  })();

  const filteredHearts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return hearts;
    return hearts.filter(
      (row) =>
        row.place?.name?.toLowerCase().includes(q) ||
        row.note?.toLowerCase().includes(q) ||
        getName(row.dropper).toLowerCase().includes(q),
    );
  }, [hearts, query]);

  const filteredSparks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sparks;
    return sparks.filter(
      (row) =>
        row.place?.name?.toLowerCase().includes(q) ||
        getName(row.dropper).toLowerCase().includes(q) ||
        getName(row.picker).toLowerCase().includes(q),
    );
  }, [sparks, query]);

  // Resets when a filter shortens the list, so filtering while on a
  // later page cannot leave you looking at an empty one.
  const { page, setPage } = usePagination(filteredHearts.length);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[1.6rem] font-medium tracking-tight">Hearts</h1>
          <p className="mt-1 max-w-2xl text-[0.92rem] leading-relaxed text-muted-foreground">
            Hearts left at venues, and the chats that started.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-8"
              placeholder="Venue, note or person"
            />
          </div>
          <Button
            variant="outline"
            onClick={expireNow}
            disabled={busy || loading}
            className="border-foreground/[0.06] text-[0.86rem]"
          >
            <Timer className="mr-2 size-4" />
            Expire
          </Button>
          <Button
            variant="outline"
            onClick={load}
            disabled={loading}
            className="border-foreground/[0.06] text-[0.86rem]"
          >
            <RefreshCw className="mr-2 size-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Live now" value={stats.live} />
        <Stat label="Picked up" value={stats.claimed} />
        <Stat label="Expired, nobody picked up" value={stats.expired} />
        <Stat label="How many get picked up" value={`${stats.pickupRate}%`} />
      </div>

      <div className="inline-flex w-fit items-center gap-0.5 rounded-full bg-foreground/[0.05] p-0.5">
        <TabButton active={tab === "hearts"} onClick={() => setTab("hearts")}>
          Hearts {hearts.length > 0 && `(${hearts.length})`}
        </TabButton>
        <TabButton active={tab === "sparks"} onClick={() => setTab("sparks")}>
          Sparks {sparks.length > 0 && `(${sparks.length})`}
        </TabButton>
        {/* The rules that produce everything in the other two tabs. They
            were on a separate"Config" page, which meant reading the
            numbers and changing what makes them were different screens. */}
        <TabButton active={tab === "hunt"} onClick={() => setTab("hunt")}>
          Heart Hunt
        </TabButton>
        <TabButton active={tab === "settings"} onClick={() => setTab("settings")}>
          Settings
        </TabButton>
      </div>

      {tab === "hunt" && <HuntPanel />}

      {tab === "settings" && <HeartSettingsPanel />}

      <Card className={tab === "settings" ? "hidden" :"border-foreground/[0.06] bg-card"}>
        <CardHeader>
          <CardTitle>{tab === "hearts" ? "Every Heart" :"Every Spark"}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <PageSkeleton sections={2} />
          ) : error ? (
            <div className="py-16 text-center text-destructive">{error}</div>
          ) : tab === "hearts" ? (
            filteredHearts.length === 0 ? (
              <EmptyState
                title="No hearts match"
                body="Either nobody has dropped one recently, or the search above is hiding them."
              />
            ) : (
              <div className="space-y-4">
                <>
                  {paginate(filteredHearts, page).map((row) => (
                  <HeartRowView
                    key={row.id}
                    row={row}
                    onWithdraw={withdraw}
                    busy={busy}
                    now={loadedAt}
                  />
                ))}
                  <Pagination page={page} total={filteredHearts.length} onPage={setPage} />
                </>
              </div>
            )
          ) : filteredSparks.length === 0 ? (
            <EmptyState
              title="No sparks yet"
              body="A spark happens when somebody picks up a heart. None have been picked up in this period."
            />
          ) : (
            <div className="space-y-4">
              {paginate(filteredSparks, page).map((row) => (
                <SparkRowView key={row.id} row={row} />
              ))}

              <Pagination
                page={page}
                total={filteredSparks.length}
                onPage={setPage}
              />
            </div>
          )}
        </CardContent>
      </Card>
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

function HeartRowView({
  row,
  onWithdraw,
  busy,
  now,
}: {
  row: HeartView;
  onWithdraw: (id: string) => void;
  busy: boolean;
  /** The instant the whole list is being judged against. */
  now: number;
}) {
  const live = row.status === "active" && new Date(row.expires_at).getTime() > now;

  return (
    <div className="flex items-center gap-4 border-b border-foreground/[0.06] pb-4 last:border-0 last:pb-0">
      <Link href={`/members/${row.dropper_id}`}>
        <Avatar className="h-10 w-10 border border-foreground/[0.06] bg-transparent">
          <AvatarImage src={row.dropper?.photos?.[0] ?? undefined} />
          <AvatarFallback className="bg-transparent text-[0.86rem]">
            {getInitials(row.dropper)}
          </AvatarFallback>
        </Avatar>
      </Link>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.92rem] font-medium">
          {getName(row.dropper)}
          <span className="text-muted-foreground"> at </span>
          {row.place?.name ??"Unknown venue"}
        </p>
        <p className="truncate text-[0.86rem] text-muted-foreground">
          {row.note || <span className="italic">No note</span>}
          {row.vibe ? ` - ${row.vibe}` :""}
          {` - ${formatDateTime(row.created_at)}`}
        </p>
      </div>

      <Badge
        variant="outline"
        className={`text-[0.86rem] ${
          STATUS_STYLES[live ? "active" : row.status] ??""
        }`}
      >
        {live ? "Active" : row.status}
      </Badge>

      {live && (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => onWithdraw(row.id)}
          title="Withdraw this heart"
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );
}

function SparkRowView({ row }: { row: SparkView }) {
  return (
    <div className="flex items-center gap-4 border-b border-foreground/[0.06] pb-4 last:border-0 last:pb-0">
      <div className="flex -space-x-4">
        <Avatar className="h-10 w-10 border border-foreground/[0.06] bg-transparent">
          <AvatarImage src={row.dropper?.photos?.[0] ?? undefined} />
          <AvatarFallback className="bg-transparent text-[0.86rem]">
            {getInitials(row.dropper)}
          </AvatarFallback>
        </Avatar>
        <Avatar className="h-10 w-10 border border-foreground/[0.06] bg-transparent">
          <AvatarImage src={row.picker?.photos?.[0] ?? undefined} />
          <AvatarFallback className="bg-transparent text-[0.86rem]">
            {getInitials(row.picker)}
          </AvatarFallback>
        </Avatar>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.92rem] font-medium">
          {getName(row.dropper)}
          <span className="text-muted-foreground"> and </span>
          {getName(row.picker)}
        </p>
        <p className="flex items-center gap-1 truncate text-[0.86rem] text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          {row.place?.name ??"Unknown venue"} - {formatDateTime(row.created_at)}
        </p>
      </div>

      <Badge
        variant="outline"
        className={`text-[0.86rem] ${
          row.removed_by ? STATUS_STYLES.expired : STATUS_STYLES.active
        }`}
      >
        {row.removed_by ? "Removed" :"Live"}
      </Badge>
    </div>
  );
}
