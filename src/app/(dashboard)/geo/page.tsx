"use client";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { DataToolbar } from "@/components/DataToolbar";
import { adminTable } from "@/lib/adminFetch";
import { Button } from "@/components/ui/button";
import { MapPin, RefreshCw } from "lucide-react";
import { Pagination, paginate, usePagination } from "@/components/ui/pagination";
import { PageHeader, Section, EmptyState } from "@/components/ui/page";
import { StatStrip, StatusPill } from "@/components/ui/stat-strip";
import { SkeletonCard, SkeletonStats } from "@/components/ui/skeleton";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { isOnline } from "@/lib/presence";
import { Segmented } from "@/components/ui/select";
import { PathsPanel } from "@/components/geo/PathsPanel";
import { useSearchParams } from "next/navigation";

type ProfileLocationRow = {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  latitude: number | null;
  longitude: number | null;
  search_radius: number | null;
  last_active: string | null;
};

type EncounterRow = {
  user_id: string | null;
  encountered_user_id: string | null;
  created_at: string | null;
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

function formatCoordinate(value: number | null) {
  return value == null ? "-" : value.toFixed(5);
}

type Tab = "now" | "paths";

const TABS: { value: Tab; label: string }[] = [
  { value: "now", label: "Where people are" },
  { value: "paths", label: "Crossing paths" },
];

export default function GeoPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() =>
    searchParams.get("tab") === "paths" ? "paths" : "now",
  );
  const [profiles, setProfiles] = useState<ProfileLocationRow[]>([]);
  const [encounters, setEncounters] = useState<EncounterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [facets, setFacets] = useState<Record<string, string>>({});

  const loadGeo = useCallback(async () => {
    setLoading(true);
    setError(null);

    // nearby_encounters is scoped to your own rows by RLS — it is a log of
    // where you have been, and one person's location history is exactly the
    // thing that must not be readable by anyone else's client.
    const [{ data: profileData, error: profileError }, { data: encounterData }] =
      await Promise.all([
        adminTable<ProfileLocationRow>("profiles", {
          select: "id, user_id, name, email, latitude, longitude, search_radius, last_active",
          order: "last_active",
          limit: 100,
        }),
        adminTable<EncounterRow>("nearby_encounters", {
          select: "user_id, encountered_user_id, created_at",
          order: "created_at",
          limit: 500,
        }),
      ]);

    if (profileError) {
      setError(profileError);
      setProfiles([]);
      setEncounters([]);
    } else {
      // The null-location filter moved here: the route takes one equality
      // filter, and"has coordinates" is cheap to apply on 100 rows.
      setProfiles(
        (profileData ?? []).filter(
          (row) => row.latitude != null && row.longitude != null,
        ),
      );
      setEncounters(encounterData ?? []);
    }

    setLoading(false);
  }, []);

  useLoadOnMount(loadGeo);

  const stats = useMemo(() => {
    // Derived from the heartbeat, not the is_online latch. See lib/presence.
    const active = profiles.filter((profile) => isOnline(profile.last_active)).length;
    const uniqueEncounterUsers = new Set(
      encounters.flatMap((encounter) =>
        [encounter.user_id, encounter.encountered_user_id].filter(Boolean),
      ),
    ).size;

    return {
      located: profiles.length,
      active,
      encounters: encounters.length,
      uniqueEncounterUsers,
    };
  }, [profiles, encounters]);

  // Only the profiles fetch carries names, and it does not cover everyone
  // in the encounter log — anybody missing falls back to a short id rather
  // than the full UUID, which is unreadable and tells the admin nothing.
  const nameByUser = useMemo(() => {
    const map = new Map<string, string>();
    for (const profile of profiles) {
      const label = profile.name || profile.email;
      if (profile.user_id && label) map.set(profile.user_id, label);
    }
    return map;
  }, [profiles]);

  const topEncountered = useMemo(() => {
    const counts = new Map<string, number>();
    for (const encounter of encounters) {
      if (!encounter.user_id) continue;
      counts.set(encounter.user_id, (counts.get(encounter.user_id) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [encounters]);

  // Only the list narrows. The counts above it stay over everyone, so a
  // filtered view never reports a subset as the whole population.
  const visibleProfiles = useMemo(() => {
    const q = query.trim().toLowerCase();

    return profiles.filter((profile) => {
      if (q) {
        const haystack = [profile.name, profile.email, profile.user_id]
          .filter(Boolean)
          .join("")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      const presence = facets.presence ??"all";
      const online = isOnline(profile.last_active);
      if (presence === "online" && !online) return false;
      if (presence === "offline" && online) return false;

      return true;
    });
  }, [profiles, query, facets]);

  // Resets when a filter shortens the list, so filtering while on a
  // later page cannot leave you staring at an empty one.
  const { page, setPage } = usePagination(visibleProfiles.length);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Location"
        description="Where members are, and where they cross."
        actions={
          <>
            <Segmented value={tab} onChange={setTab} options={TABS} />
            {tab === "now" && (
              <Button variant="secondary" onClick={loadGeo} disabled={loading}>
                <RefreshCw className={loading ? "animate-spin" : undefined} />
                Refresh
              </Button>
            )}
          </>
        }
      />

      {/*
        The leaderboard moved here, off the locations tab.

        "Crossing paths most" is a reading of the crossing data, so it
        belongs beside the settings that decide what counts as a
        crossing — change the radius and this list is what changes. On
        the other tab it was a narrow column squeezing the location
        list into two thirds of the page for a panel about a different
        subject.
      */}
      {tab === "paths" && (
        <div className="space-y-4">
          {/* The two crossing numbers, on the tab that is about
              crossings. They were in a strip of four on the other one,
              mixed with location counts. */}
          {!loading && (
            <StatStrip
              stats={[
                { label: "Times people were near each other", value: stats.encounters },
                { label: "People involved", value: stats.uniqueEncounterUsers },
              ]}
            />
          )}

          <PathsPanel />

          <Section
            title="Crossing paths most"
            hint="Most often near others, out of the last 500 crossings. This is what the settings above produce."
          >
            {loading ? (
              <SkeletonCard lines={4} />
            ) : topEncountered.length === 0 ? (
              <EmptyState
                title="Nobody yet"
                body="This fills in once members start being near each other."
              />
            ) : (
              <div className="space-y-3">
                {topEncountered.map(([userId, count]) => {
                  const percentage = Math.max(
                    8,
                    Math.round((count / topEncountered[0][1]) * 100),
                  );
                  const name = nameByUser.get(userId);

                  return (
                    <div key={userId} className="space-y-1.5">
                      <div className="flex justify-between gap-3 text-[0.86rem]">
                        <Link
                          href={`/members/${userId}`}
                          className={`truncate hover:underline ${
                            name ? "" : "font-mono text-muted-foreground"
                          }`}
                        >
                          {name ?? "Deleted account"}
                        </Link>
                        <span className="tnum shrink-0 text-muted-foreground">
                          {count} times
                        </span>
                      </div>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-foreground/[0.08]">
                        <div
                          className="h-full rounded-full bg-foreground/50"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </div>
      )}

      {tab === "now" && (
        <>
      {error && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/8 px-3.5 py-2.5 text-[0.92rem] text-destructive">
          {error}
        </div>
      )}

      {/*
        Two stats, not four.

        The other two counted crossings — "times people were near each
        other" and "people involved" — which is the subject of the other
        tab, sitting on this one. A strip of four numbers about two
        different things reads as one summary of neither.
      */}
      {loading ? (
        <SkeletonStats count={2} />
      ) : (
        <StatStrip
          stats={[
            { label: "Members with a location", value: stats.located, icon: MapPin },
            { label: "Online right now", value: stats.active, tone: "success" },
          ]}
        />
      )}

      {/* Full width now the crossings panel has moved to its own tab. */}
      <div>
        <Section
          title="Recent locations"
          hint="Last known place, and how far they search."
        >
          <div className="mb-4">
            <DataToolbar
              query={query}
              onQuery={setQuery}
              searchPlaceholder="Search by name or email"
              filters={[
                {
                  id: "presence",
                  label: "Presence",
                  options: [
                    { value: "online", label: "Online", count: stats.active },
                    {
                      value: "offline",
                      label: "Offline",
                      count: Math.max(0, stats.located - stats.active),
                    },
                  ],
                },
              ]}
              values={facets}
              onFilter={(id, value) =>
                setFacets((current) => ({ ...current, [id]: value }))
              }
              onRefresh={loadGeo}
              loading={loading}
              showing={visibleProfiles.length}
              total={profiles.length}
            />
          </div>

          {loading ? (
            <div className="grid gap-3 md:grid-cols-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <SkeletonCard key={index} lines={2} />
              ))}
            </div>
          ) : visibleProfiles.length === 0 ? (
            <EmptyState
              title="No locations yet"
              body="Nobody has shared a location, or the search above is hiding everyone."
            />
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                {paginate(visibleProfiles, page).map((profile) => (
                  <div
                    key={profile.id}
                    className="rounded-xl border border-foreground/[0.06] bg-card/70 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[0.92rem] font-medium">
                          {profile.name || profile.email || profile.user_id}
                        </p>
                        <p className="truncate font-mono text-[0.8rem] text-muted-foreground">
                          {formatCoordinate(profile.latitude)},{" "}
                          {formatCoordinate(profile.longitude)}
                        </p>
                      </div>
                      <StatusPill tone={isOnline(profile.last_active) ? "success" : "neutral"}>
                        {isOnline(profile.last_active) ? "Online" : "Offline"}
                      </StatusPill>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[0.8rem] text-muted-foreground">
                      <span>Searching {profile.search_radius ?? 10} km</span>
                      <span>{formatDateTime(profile.last_active)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Outside the grid. It had been dropped inside it, so the
                  browser laid the controls out as another card. */}
              <Pagination
                page={page}
                total={visibleProfiles.length}
                onPage={setPage}
              />
            </>
          )}
        </Section>
      </div>
        </>
      )}
    </div>
  );
}
