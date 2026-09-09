"use client";
import { Suspense, useCallback, useMemo, useState } from "react";
import { DataToolbar } from "@/components/DataToolbar";
import { useSearchParams } from "next/navigation";
import { adminTable } from "@/lib/adminFetch";
import {
  profileStrength,
  STRENGTH_COLUMNS,
  type StrengthFields,
} from "@/lib/profileStrength";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, Filter } from "lucide-react";
import Link from "next/link";
import { Pagination, paginate, usePagination } from "@/components/ui/pagination";
import { PageSkeleton } from "@/components/ui/page";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { isOnline } from "@/lib/presence";
import { useLiveTable } from "@/lib/useLiveTable";

type ProfileRow = StrengthFields & {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  age: number | null;
  gender: string | null;
  created_at: string;
  search_radius: number | null;
  latitude: number | null;
  longitude: number | null;
  /*
   * No is_online here.
   *
   * That column is a latch — written true by a location push and never
   * cleared by anything — so it read "Online" for accounts that had not
   * opened the app in days. Presence comes from last_active now, via
   * lib/presence, matching what the database serves members.
   */
  last_active: string | null;
  interested_in: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  city: string | null;
  face_verified_at: string | null;
  published_at: string | null;
};

/**
 * The command palette links straight to a filtered list —"Photo audit" and
 *"Weak profiles" are questions an admin asks often enough that they deserve
 * a URL rather than a sequence of clicks.
 */
const FILTERS = {"no-photos": {
    label: "No photos",
    description: "Accounts with no photo, or only one.",
    test: (member: ProfileRow) => (member.photos?.length ?? 0) < 2,
  },
  weak: {
    label: "Weak profiles",
    description: "Accounts under 40% complete.",
    test: (member: ProfileRow) => profileStrength(member) < 40,
  },
  suspended: {
    label: "Suspended",
    description: "Accounts locked out from the moderation queue.",
    test: (member: ProfileRow) => member.suspended_at != null,
  },
} as const;

type FilterKey = keyof typeof FILTERS;

function isFilterKey(value: string | null): value is FilterKey {
  return value !== null && value in FILTERS;
}

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      });
}

function getInitials(value: string | null) {
  const source = value?.trim() ||"US";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function MembersPage() {
  // useSearchParams bails out of prerendering up to the nearest boundary, and
  // a production build fails outright without one.
  return (
    <Suspense
      fallback={<PageSkeleton sections={2} />}
    >
      <MembersView />
    </Suspense>
  );
}

function MembersView() {
  const searchParams = useSearchParams();
  const [members, setMembers] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filterParam = searchParams.get("filter");
  const filter = isFilterKey(filterParam) ? filterParam : null;

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Read through the panel's own route rather than straight from Supabase:
    // with RLS on, profiles answers a signed-in admin with their own row and
    // nothing else, so a direct query here returns an empty table.
    const { data, error } = await adminTable<ProfileRow>("profiles", {
      select: "id, user_id, name, email, age, gender, created_at, search_radius, latitude, longitude, last_active, interested_in, suspended_at, suspended_reason, city, face_verified_at, published_at, " +
        STRENGTH_COLUMNS,
      order: "created_at",
      limit: 5000,
    });

    if (error) {
      setError(error);
      setMembers([]);
    } else {
      setMembers(data ?? []);
    }

    setLoading(false);
  }, []);

  useLoadOnMount(loadMembers);

  // New signups and suspensions both land in profiles, so the list stays
  // current without anyone reaching for refresh.
  useLiveTable("profiles", loadMembers);

  const stats = useMemo(() => {
    // Derived from the heartbeat rather than the is_online column, which
    // was a latch nothing ever cleared. See lib/presence.
    const online = members.filter((member) => isOnline(member.last_active)).length;
    const withLocation = members.filter(
      (member) => member.latitude != null && member.longitude != null,
    ).length;

    return {
      total: members.length,
      online,
      withLocation,
    };
  }, [members]);

  // Stats stay over the whole population; only the table narrows. A filtered
  // view that also rewrites"Total Profiles" is how an admin ends up
  // reporting the size of a subset as the size of the app.
  const [query, setQuery] = useState("");
  const [facets, setFacets] = useState<Record<string, string>>({});
  const [sort, setSort] = useState("recent");

  const setFacet = useCallback((id: string, value: string) => {
    setFacets((current) => ({ ...current, [id]: value }));
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();

    const rows = members.filter((member) => {
      if (filter && !FILTERS[filter].test(member)) return false;

      if (q) {
        const haystack = [member.name, member.email, member.city, member.user_id]
          .filter(Boolean)
          .join("")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      const status = facets.status ??"all";
      if (status === "suspended" && !member.suspended_at) return false;
      if (status === "active" && member.suspended_at) return false;
      if (status === "online" && !isOnline(member.last_active)) return false;

      const verified = facets.verified ??"all";
      if (verified === "face" && !member.face_verified_at) return false;
      if (verified === "unverified" && member.face_verified_at) return false;

      const published = facets.published ??"all";
      if (published === "live" && !member.published_at) return false;
      if (published === "draft" && member.published_at) return false;

      return true;
    });

    // Sorted on a copy: the loaded list is the order the server sent and
    // other things read it.
    return [...rows].sort((a, b) => {
      if (sort === "name") return (a.name ??"").localeCompare(b.name ??"");
      if (sort === "strength") return profileStrength(b) - profileStrength(a);
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    });
  }, [members, filter, query, facets, sort]);

  // Resets itself when a filter shortens the list, so filtering while
  // on a later page cannot leave you staring at an empty table.
  const { page, setPage } = usePagination(visible.length);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.6rem] font-medium tracking-tight">Members</h1>
          <p className="mt-1 max-w-2xl text-[0.92rem] leading-relaxed text-muted-foreground">
            Everybody who signed up. Open anyone for the full picture.
          </p>
        </div>
      </div>

      <DataToolbar
        query={query}
        onQuery={setQuery}
        searchPlaceholder="Search by name, email or city"
        filters={[
          {
            id: "status",
            label: "Status",
            options: [
              { value: "active", label: "Active" },
              { value: "suspended", label: "Suspended" },
              { value: "online", label: "Online" },
            ],
          },
          {
            id: "verified",
            label: "Verified",
            options: [
              { value: "face", label: "Face" },
              { value: "unverified", label: "Not verified" },
            ],
          },
          {
            id: "published",
            label: "Discovery",
            options: [
              { value: "live", label: "Live" },
              { value: "draft", label: "Hidden" },
            ],
          },
        ]}
        values={facets}
        onFilter={setFacet}
        sorts={[
          { id: "recent", label: "Newest first" },
          { id: "name", label: "Name" },
          { id: "strength", label: "Profile strength" },
        ]}
        sort={sort}
        onSort={setSort}
        onRefresh={loadMembers}
        loading={loading}
        showing={visible.length}
        total={members.length}
      />

      {filter && (
        <div className="flex items-center gap-3 border border-foreground/[0.06] bg-foreground/[0.03] px-4 py-3">
          <Filter className="size-4 shrink-0 text-muted-foreground" />
          <span className="text-[0.92rem]">
            <span className="font-medium">{FILTERS[filter].label}</span>
            <span className="text-muted-foreground">
              {" —"}
              {visible.length} of {members.length} accounts
            </span>
          </span>
          <Link
            href="/members"
            className="ml-auto text-[0.86rem] text-muted-foreground transition-colors hover:text-foreground"
          >
            Clear
          </Link>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-foreground/[0.06] bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-[0.92rem] font-medium text-muted-foreground">
              Total Profiles
            </CardTitle>
          </CardHeader>
          <CardContent className="tnum text-[1.9rem] font-light tracking-tight">
            {stats.total}
          </CardContent>
        </Card>
        <Card className="border-foreground/[0.06] bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-[0.92rem] font-medium text-muted-foreground">
              Online
            </CardTitle>
          </CardHeader>
          <CardContent className="tnum text-[1.9rem] font-light tracking-tight">
            {stats.online}
          </CardContent>
        </Card>
        <Card className="border-foreground/[0.06] bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-[0.92rem] font-medium text-muted-foreground">
              With Location
            </CardTitle>
          </CardHeader>
          <CardContent className="tnum text-[1.9rem] font-light tracking-tight">
            {stats.withLocation}
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border border-foreground/[0.06] bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-foreground/[0.06] hover:bg-transparent">
              <TableHead>Profile</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Interested In</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  Loading…
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-destructive"
                >
                  {error}
                </TableCell>
              </TableRow>
            ) : visible.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  No members match this search.
                </TableCell>
              </TableRow>
            ) : (
              paginate(visible, page).map((member) => (
                <TableRow
                  key={member.id}
                  className="cursor-pointer border-foreground/[0.06] hover:bg-foreground/[0.03]"
                >
                  <TableCell>
                    <Link
                      href={`/members/${member.user_id}`}
                      className="flex items-center gap-3"
                    >
                      <Avatar className="h-10 w-10 border border-foreground/[0.06]">
                        <AvatarImage src={member.photos?.[0] ||""} />
                        <AvatarFallback className="bg-muted text-muted-foreground">
                          {getInitials(member.name || member.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="space-y-1">
                        <div className="font-medium">
                          {member.name ||"Unknown"}
                        </div>
                        <div className="font-mono text-[0.86rem] text-muted-foreground">
                          {member.email || member.user_id}
                        </div>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>{member.age ??"-"}</TableCell>
                  <TableCell className="capitalize">
                    {member.gender ||"-"}
                  </TableCell>
                  <TableCell className="capitalize">
                    {member.interested_in ||"everyone"}
                  </TableCell>
                  <TableCell>
                    {/* Suspended outranks online: someone locked out may still
                        have an open socket, and "Online" would be the least
                        useful true thing to say about them.

                        Online itself comes from the heartbeat rather than
                        the is_online column — that was a latch nothing
                        ever cleared, so accounts read "Online" days after
                        their last visit. See lib/presence. */}
                    {member.suspended_at ? (
                      <Badge
                        variant="outline"
                        className="border-destructive/30 bg-destructive/10 text-destructive"
                        title={member.suspended_reason || undefined}
                      >
                        Suspended
                      </Badge>
                    ) : (
                      <Badge
                        variant={isOnline(member.last_active) ? "default" : "secondary"}
                        className={
                          isOnline(member.last_active)
                            ? "bg-primary text-primary-foreground hover:bg-primary/80"
                            : ""
                        }
                      >
                        {isOnline(member.last_active) ? "Online" : "Offline"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-[0.86rem] text-muted-foreground">
                    <Link
                      href={`/members/${member.user_id}`}
                      className="flex items-center justify-end gap-3"
                    >
                      <span>{formatDate(member.created_at)}</span>
                      <Eye className="size-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="px-4 pb-3">
          <Pagination page={page} total={visible.length} onPage={setPage} />
        </div>
      </div>
    </div>
  );
}
