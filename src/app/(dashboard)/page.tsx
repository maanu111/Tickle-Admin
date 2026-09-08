"use client";
import { useCallback, useMemo, useState } from "react";
import { PagedList } from "@/components/ui/paged-list";
import { adminCounts, adminTable } from "@/lib/adminFetch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Activity, Heart, MessageSquare, RefreshCw, Users } from "lucide-react";
import type { EChartsOption } from "echarts";
import { Chart, barSeries, lineSeries, useVizPalette } from "@/components/ui/chart";
import { StatStrip } from "@/components/ui/stat-strip";
import { Skeleton, SkeletonStats } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { MetricsBand } from "@/components/MetricsBand";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { useLiveTable } from "@/lib/useLiveTable";
import { useNames } from "@/lib/useNames";
import { isOnline } from "@/lib/presence";

type ProfileRow = {
  created_at: string;
  /*
   * last_active, not is_online.
   *
   * is_online is a latch nothing ever cleared — see src/lib/presence.ts.
   * Online is derived from the heartbeat instead.
   */
  last_active: string | null;
  /*
   * Widened for the charts below.
   *
   * The page fetched two columns and drew one line from them. These are
   * the fields that answer the questions a dashboard is opened to ask:
   * who is here, where, how old, and how many got far enough through
   * signup to be seen by anybody.
   */
  gender: string | null;
  age: number | null;
  city: string | null;
  published_at: string | null;
  face_verified_at: string | null;
  photos: string[] | null;
};

type MatchRow = {
  created_at: string;
};

type FeedItem = {
  id: string;
  label: string;
  /** Who it happened to. Named at render time, once their profile is in. */
  people: string[];
  /** The word between two people: "and", "liked", "passed on". */
  join?: string;
  created_at: string;
};

type RecentMessageRow = {
  id: string;
  match_id: string;
  sender_id: string;
  created_at: string;
};

type RecentMatchRow = {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at: string;
};

type RecentLikeRow = {
  id: string;
  liker_id: string;
  liked_id: string;
  created_at: string;
};

type RecentPassRow = {
  id: string;
  passer_id: string;
  passed_id: string;
  created_at: string;
};

type RecentStoryRow = {
  id: string;
  user_id: string;
  created_at: string;
};

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

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

export default function PulseDashboard() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [messagesCount, setMessagesCount] = useState(0);
  const [likesCount, setLikesCount] = useState(0);
  const [passesCount, setPassesCount] = useState(0);
  const [storiesCount, setStoriesCount] = useState(0);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The feed is people doing things to each other, so it needs names.
  const { resolve: resolveNames, nameOf } = useNames();

  const loadPulse = useCallback(async () => {
    setLoading(true);
    setError(null);

    /*
     * Everything reads through the panel's own route now.
     *
     * With RLS on, a signed-in admin querying these tables directly sees
     * their own rows and nothing else, so this page rendered six zeroes and
     * an empty feed. The route uses the service role behind an admin check.
     *
     * The four totals are counts rather than fetches — the old code pulled
     * every message row into the browser to call .length on it.
     */
    const [
      countsResult,
      profilesResult,
      matchesResult,
      recentMessagesResult,
      recentMatchesResult,
      recentLikesResult,
      recentPassesResult,
      recentStoriesResult,
    ] = await Promise.all([
      adminCounts([
        "messages",
        "likes",
        "passes",
        { table: "dailies", gt: ["expires_at", new Date().toISOString()] },
      ]),
      adminTable<ProfileRow>("profiles", {
        select:
          "created_at, last_active, gender, age, city, published_at, face_verified_at, photos",
        limit: 5000,
      }),
      adminTable<MatchRow>("matches", { select: "created_at", limit: 5000 }),
      adminTable<RecentMessageRow>("messages", {
        select: "id, match_id, sender_id, created_at",
        order: "created_at",
        limit: 3,
      }),
      adminTable<RecentMatchRow>("matches", {
        select: "id, user1_id, user2_id, created_at",
        order: "created_at",
        limit: 3,
      }),
      adminTable<RecentLikeRow>("likes", {
        select: "id, liker_id, liked_id, created_at",
        order: "created_at",
        limit: 3,
      }),
      adminTable<RecentPassRow>("passes", {
        select: "id, passer_id, passed_id, created_at",
        order: "created_at",
        limit: 3,
      }),
      adminTable<RecentStoryRow>("dailies", {
        select: "id, user_id, created_at",
        order: "created_at",
        limit: 3,
      }),
    ]);

    const firstError =
      countsResult.error ??
      profilesResult.error ??
      matchesResult.error ??
      recentMessagesResult.error ??
      recentMatchesResult.error ??
      recentLikesResult.error ??
      recentPassesResult.error ??
      recentStoriesResult.error;

    if (firstError) {
      setError(firstError);
      setLoading(false);
      return;
    }

    const counts = countsResult.data ?? {};

    setProfiles(profilesResult.data ?? []);
    setMatches(matchesResult.data ?? []);
    setMessagesCount(counts.messages ?? 0);
    setLikesCount(counts.likes ?? 0);
    setPassesCount(counts.passes ?? 0);
    setStoriesCount(counts.dailies ?? 0);

    const recentMessages = (
      (recentMessagesResult.data ?? []) as RecentMessageRow[]
    ).map((message) => ({
      id: `message-${message.id}`,
      label: "Message",
      people: [message.sender_id],
      created_at: message.created_at,
    }));
    const recentMatches = (
      (recentMatchesResult.data ?? []) as RecentMatchRow[]
    ).map((match) => ({
      id: `match-${match.id}`,
      label: "Match",
      people: [match.user1_id, match.user2_id],
      join: "and",
      created_at: match.created_at,
    }));
    const recentLikes = ((recentLikesResult.data ?? []) as RecentLikeRow[]).map(
      (like) => ({
        id: `like-${like.id}`,
        label: "Like",
        people: [like.liker_id, like.liked_id],
        join: "liked",
        created_at: like.created_at,
      }),
    );
    const recentPasses = (
      (recentPassesResult.data ?? []) as RecentPassRow[]
    ).map((pass) => ({
      id: `pass-${pass.id}`,
      label: "Pass",
      people: [pass.passer_id, pass.passed_id],
      join: "passed on",
      created_at: pass.created_at,
    }));
    const recentStories = (
      (recentStoriesResult.data ?? []) as RecentStoryRow[]
    ).map((story) => ({
      id: `story-${story.id}`,
      label: "Daily",
      people: [story.user_id],
      created_at: story.created_at,
    }));

    // Names for everybody the feed mentions, in one lookup. The feed
    // renders immediately and fills in as they arrive.
    void resolveNames(
      [
        ...recentMessages,
        ...recentMatches,
        ...recentLikes,
        ...recentPasses,
        ...recentStories,
      ].flatMap((item) => item.people),
    );

    setFeed(
      [
        ...recentMessages,
        ...recentMatches,
        ...recentLikes,
        ...recentPasses,
        ...recentStories,
      ]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .slice(0, 10),
    );
    setLoading(false);
  }, [resolveNames]);

  useLoadOnMount(loadPulse);

  const stats = useMemo(() => {
    const today = startOfDay(new Date());
    const activeToday = profiles.filter((profile) =>
      isOnline(profile.last_active),
    ).length;
    const matchesToday = matches.filter(
      (match) => new Date(match.created_at) >= today,
    ).length;

    return {
      totalUsers: profiles.length,
      activeToday,
      matchesToday,
      messages: messagesCount,
      likes: likesCount,
      passes: passesCount,
      stories: storiesCount,
    };
  }, [profiles, matches, messagesCount, likesCount, passesCount, storiesCount]);

  /*
   * Seven days of signups.
   *
   * The theme is gone from here entirely — it lived inline and was
   * written for the old black panel, so every colour in it (white
   * strokes, a black tooltip) is invisible on the light ground. The
   * Chart wrapper owns the house style now; this supplies only the
   * shape of the data.
   */
  const palette = useVizPalette();

  /*
   * Signups against matches, on one pair of axes.
   *
   * The growth chart drew one line and answered half a question. People
   * arriving is only good news if they are also matching — a week where
   * signups climb and matches stay flat is the shape of a city filling
   * up with people who cannot find anybody, which is worth seeing before
   * it becomes churn.
   */
  const activityOption = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, index) => {
      const date = startOfDay(new Date());
      date.setDate(date.getDate() - (13 - index));
      return date;
    });

    const perDay = (rows: { created_at: string }[]) =>
      days.map(
        (day) =>
          rows.filter((row) => {
            const at = new Date(row.created_at);
            return at >= day && at < new Date(day.getTime() + 86_400_000);
          }).length,
      );

    return {
      legend: { show: true },
      // Room made for the legend, which otherwise sits on the plot: the
      // house grid starts 16px from the top because most charts here
      // have no legend at all.
      grid: { top: 34 },
      xAxis: {
        data: days.map((day) =>
          day.toLocaleDateString("en-US", { day: "numeric", month: "short" }),
        ),
      },
      series: [
        lineSeries("Signups", perDay(profiles), palette[0], { area: true }),
        lineSeries("Matches", perDay(matches), palette[1]),
      ],
    } as EChartsOption;
  }, [profiles, matches, palette]);

  /*
   * How far people get through signing up.
   *
   * A funnel rather than four separate counts, because the gaps between
   * the bars are the finding. Somewhere between "joined" and "can be
   * seen" is where a signup flow leaks, and four numbers side by side
   * hide exactly that.
   */
  const funnelOption = useMemo(() => {
    const joined = profiles.length;
    const withPhotos = profiles.filter((row) => (row.photos?.length ?? 0) > 0).length;
    const published = profiles.filter((row) => row.published_at).length;
    const verified = profiles.filter((row) => row.face_verified_at).length;

    return {
      xAxis: { data: ["Joined", "Added a photo", "Went live", "Verified"] },
      series: [
        barSeries("People", [joined, withPhotos, published, verified], palette[0]),
      ],
    } as EChartsOption;
  }, [profiles, palette]);

  /*
   * Who is here, and where.
   *
   * The balance matters more on a dating app than almost any other
   * number: a deck is built from people looking for each other, so a
   * lopsided split is felt by everyone on the long side as an empty app.
   */
  const genderOption = useMemo(() => {
    const tally: Record<string, number> = {};

    for (const row of profiles) {
      const key = row.gender ?? "Not set";
      tally[key] = (tally[key] ?? 0) + 1;
    }

    return {
      tooltip: { trigger: "item" },
      series: [
        {
          type: "pie" as const,
          radius: ["58%", "82%"],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderWidth: 2, borderColor: "#fff" },
          label: { show: false },
          data: Object.entries(tally).map(([name, value]) => ({
            name: name === "male" ? "Men" : name === "female" ? "Women" : name,
            value,
          })),
        },
      ],
      /*
       * Under the ring, not above it.
       *
       * top is undone explicitly: the house legend sets it so the
       * line charts can reserve headroom, and leaving both set makes
       * ECharts honour the top and ignore the bottom.
       */
      legend: { show: true, top: undefined, bottom: 0, left: "center" },
    } as EChartsOption;
  }, [profiles]);

  const cityOption = useMemo(() => {
    const tally: Record<string, number> = {};

    for (const row of profiles) {
      const key = (row.city ?? "").trim();
      if (key) tally[key] = (tally[key] ?? 0) + 1;
    }

    // Busiest at the top. Horizontal because city names are words, and
    // words rotated on an axis are words nobody reads.
    const ranked = Object.entries(tally)
      .sort((a, b) => a[1] - b[1])
      .slice(-8);

    return {
      grid: { left: 100, right: 24, top: 12, bottom: 12 },
      xAxis: { type: "value" as const, min: 0, minInterval: 1 },
      /*
       * min and minInterval explicitly undone here.
       *
       * The house yAxis carries them so counts never draw a negative
       * floor, but this chart is rotated — its y is the category axis,
       * where a min of 0 means "start at the first category" and can
       * drop labels. They move to the x axis, which is the value one.
       */
      yAxis: {
        type: "category" as const,
        data: ranked.map(([name]) => name),
        min: undefined,
        minInterval: undefined,
      },
      series: [
        {
          type: "bar" as const,
          data: ranked.map(([, value]) => value),
          barMaxWidth: 18,
          itemStyle: { color: palette[2], borderRadius: [2, 6, 6, 2] },
        },
      ],
    } as EChartsOption;
  }, [profiles, palette]);

  /*
   * Ages, in five-year bands.
   *
   * Bands rather than a point per year: one person aged 34 is noise, and
   * a chart with a spike per individual reads as a pattern that is not
   * there.
   */
  const ageOption = useMemo(() => {
    const bands = ["18-24", "25-29", "30-34", "35-39", "40-49", "50+"];
    const counts = new Array(bands.length).fill(0);

    for (const row of profiles) {
      const age = row.age;
      if (!age) continue;

      const index =
        age < 25 ? 0 : age < 30 ? 1 : age < 35 ? 2 : age < 40 ? 3 : age < 50 ? 4 : 5;

      counts[index] += 1;
    }

    return {
      xAxis: { data: bands },
      series: [barSeries("Members", counts, palette[3])],
    } as EChartsOption;
  }, [profiles, palette]);

  /* The sparkline under each stat: signups per day, same seven days. */
  const spark = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, index) => {
      const date = startOfDay(new Date());
      date.setDate(date.getDate() - (13 - index));
      return date;
    });

    return days.map(
      (day) =>
        profiles.filter((profile) => {
          const created = new Date(profile.created_at);
          return (
            created >= day &&
            created < new Date(day.getTime() + 24 * 60 * 60 * 1000)
          );
        }).length,
    );
  }, [profiles]);

  return (
    <div className="space-y-4">
      {/* Title row: heading left, actions right, ascending in weight —
          ghost, then secondary, then the one filled button. */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.6rem] leading-tight font-medium tracking-tight">
            Pulse Overview
          </h1>
          <p className="mt-0.5 text-[1rem] text-muted-foreground">
            Live metrics across profiles, matches, messages and activity.
          </p>
        </div>

        <Button variant="secondary" onClick={loadPulse} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : undefined} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/8 px-3 py-2 text-[0.92rem] text-destructive">
          {error}
        </div>
      )}

      {/* One strip, four facts, hairline rules — not four cards. */}
      {loading ? (
        <SkeletonStats count={4} />
      ) : (
        <StatStrip
          stats={[
            {
              label: "Total members",
              value: stats.totalUsers,
              icon: Users,
              spark,
            },
            {
              label: "Online now",
              value: stats.activeToday,
              icon: Activity,
              tone: "success",
            },
            {
              label: "Matches today",
              value: stats.matchesToday,
              icon: Heart,
            },
            {
              label: "Messages sent",
              value: stats.messages,
              icon: MessageSquare,
            },
          ]}
        />
      )}

      {/* Asymmetric on purpose: a 50/50 split would read the chart and
          the feed as equals, and the chart is the subject. */}
      <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Signups and matches</CardTitle>
            <CardDescription>
              Two weeks. People arriving is only good news if they are matching
              too — signups climbing while matches stay flat is a city filling
              up with people who cannot find anybody.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Chart option={activityOption} height={260} loading={loading} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-2.5">
                    <Skeleton className="size-1.5 shrink-0 rounded-full" />
                    <Skeleton className="h-3 flex-1 rounded-lg" />
                    <Skeleton className="h-2.5 w-10 shrink-0 rounded-lg" />
                  </div>
                ))}
              </div>
            ) : feed.length === 0 ? (
              <p className="py-10 text-center text-[0.92rem] text-muted-foreground">
                No recent activity.
              </p>
            ) : (
              <div className="-mx-1.5 space-y-0.5">
                <PagedList
                  items={feed}
                  perPage={20}
                  className="divide-y divide-foreground/[0.06]"
                >
                  {(item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-foreground/[0.03]"
                    >
                      <span className="size-1.5 shrink-0 rounded-full bg-foreground/25" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.92rem] leading-tight font-medium">
                          {item.label}
                        </p>
                        <p className="truncate text-[1rem] text-muted-foreground">
                          {nameOf(item.people[0])}
                          {item.people[1] && (
                            <>
                              <span className="px-1">{item.join ?? "and"}</span>
                              {nameOf(item.people[1])}
                            </>
                          )}
                        </p>
                      </div>
                      <span className="tnum shrink-0 text-[0.8rem] text-muted-foreground">
                        {formatDateTime(item.created_at)}
                      </span>
                    </div>
                  )}
                </PagedList>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/*
        Who is actually here.

        The page had one chart and six totals, which says how much is
        happening and nothing about who it is happening to. These four
        answer the questions somebody opens a dashboard with: does the
        signup flow leak, is the balance workable, where are people, and
        how old are they.
      */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>How far people get</CardTitle>
            <CardDescription>
              Every step between joining and being visible in somebody
              else&apos;s deck. The gaps are where the signup flow leaks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Chart option={funnelOption} height={240} loading={loading} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Men and women</CardTitle>
            <CardDescription>
              A deck is built from people looking for each other, so a lopsided
              split is felt as an empty app by everyone on the long side.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Chart option={genderOption} height={240} loading={loading} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Where people are</CardTitle>
            <CardDescription>
              Busiest first. Density decides whether a deck ever fills.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Chart option={cityOption} height={240} loading={loading} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ages</CardTitle>
            <CardDescription>
              In bands, because one person aged 34 is noise rather than a
              pattern.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Chart option={ageOption} height={240} loading={loading} />
          </CardContent>
        </Card>
      </div>

      <MetricsBand />
    </div>
  );
}
