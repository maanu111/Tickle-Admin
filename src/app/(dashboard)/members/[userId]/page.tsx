"use client";

/* eslint-disable @next/next/no-img-element */
import { useCallback, useMemo, useState } from "react";
import { PagedList } from "@/components/ui/paged-list";
import { RoseWallet } from "@/components/RoseWallet";
import { MemberActions } from "@/components/MemberActions";
import { ViewAsUser } from "@/components/ViewAsUser";
import { Adjustments } from "@/components/Adjustments";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Pagination,
  paginate,
  usePagination,
} from "@/components/ui/pagination";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { isOnline } from "@/lib/presence";
import {
  ArrowLeft,
  Heart,
  MapPin,
  MessageSquare,
  RefreshCw,
  UserRound,
  X,
} from "lucide-react";

type Profile = {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  photos: string[] | null;
  bio: string | null;
  age: number | null;
  gender: string | null;
  created_at: string;
  search_radius: number | null;
  latitude: number | null;
  longitude: number | null;
  last_active: string | null;
  interested_in: string | null;
  suspended_at: string | null;
  face_verified_at: string | null;
  phone_verified_at: string | null;
  premium_until: string | null;
  published_at: string | null;
};

type RelatedProfile = {
  user_id: string;
  name: string | null;
  email: string | null;
  photos: string[] | null;
  age: number | null;
  gender: string | null;
  last_active: string | null;
};

type LikeRow = {
  id: string;
  liker_id: string;
  liked_id: string;
  created_at: string;
};

type PassRow = {
  id: string;
  passer_id: string;
  passed_id: string;
  created_at: string;
};

type MatchRow = {
  id: string;
  user1_id: string;
  user2_id: string;
  last_message_at: string;
  created_at: string;
};

type MessageRow = {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  read: boolean;
  created_at: string;
};

type StoryRow = {
  id: string;
  user_id: string;
  photo_url: string;
  created_at: string;
  expires_at: string;
};

type EncounterRow = {
  id: string;
  user_id: string | null;
  encountered_user_id: string | null;
  created_at: string | null;
};

type AuthUser = {
  id: string;
  email?: string;
  phone?: string;
  created_at?: string;
  last_sign_in_at?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

type DetailPayload = {
  auth_user: AuthUser | null;
  profile: Profile | null;
  related_profiles: RelatedProfile[];
  likes_sent: LikeRow[];
  likes_received: LikeRow[];
  passes_sent: PassRow[];
  passes_received: PassRow[];
  matches: MatchRow[];
  messages_sent: MessageRow[];
  match_messages: MessageRow[];
  stories: StoryRow[];
  encounters_started: EncounterRow[];
  encounters_received: EncounterRow[];
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function displayName(
  profile: RelatedProfile | Profile | null | undefined,
  id: string,
) {
  // No profile behind the id means the account is gone. Saying so is
  // more use than eight characters of a uuid nobody can look up.
  return profile?.name || profile?.email || (id ? "Deleted account" : "Nobody");
}

function personSubtitle(profile: RelatedProfile | null | undefined) {
  const parts = [profile?.age, profile?.gender].filter(Boolean);
  return parts.length
    ? parts.join(" /")
    : profile?.email || "Profile data missing";
}

function StatCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: number | string;
  icon: typeof Heart;
}) {
  return (
    <Card className="border-foreground/[0.06] bg-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-[0.92rem] font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="size-4 text-foreground" />
      </CardHeader>
      <CardContent className="tnum text-[1.9rem] font-light tracking-tight">
        {value}
      </CardContent>
    </Card>
  );
}

function PersonRow({
  profile,
  fallbackId,
  meta,
}: {
  profile: RelatedProfile | null | undefined;
  fallbackId: string;
  meta: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-foreground/[0.06] py-3 last:border-0">
      {profile?.photos?.[0] ? (
        <img
          src={profile.photos[0]}
          alt={displayName(profile, fallbackId)}
          className="h-12 w-12 object-cover"
        />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center border border-foreground/[0.06] bg-muted">
          <UserRound className="size-5 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[0.92rem] font-medium">
          {displayName(profile, fallbackId)}
        </div>
        <div className="truncate text-[0.86rem] text-muted-foreground">
          {personSubtitle(profile)}
        </div>
      </div>
      <div className="shrink-0 text-right text-[0.86rem] text-muted-foreground">
        {meta}
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  /*
   * Boxed rather than underlined.
   *
   * This page stacks eleven of these — photos, dailies, matches,
   * messages, likes, encounters — and a heading with a hairline under it
   * is not enough separation at that length: the end of one list and the
   * heading of the next read as the same block. A surface with its own
   * edge says where each subject stops.
   */
  return (
    <section className="overflow-hidden rounded-2xl border border-foreground/[0.06] bg-card/85">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h2 className="text-[1rem] font-medium">{title}</h2>
        {count != null && <Badge variant="secondary">{count}</Badge>}
      </div>
      <div className="border-t border-foreground/[0.06] p-4">{children}</div>
    </section>
  );
}

export default function MemberProfilePage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const supabase = useMemo(() => createClient(), []);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMember = useCallback(async () => {
    setLoading(true);
    setError(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setError("Your session expired. Sign in again.");
      setLoading(false);
      return;
    }

    const response = await fetch(`/api/members/${encodeURIComponent(userId)}`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    const result = (await response.json()) as DetailPayload & {
      error?: string;
    };

    if (!response.ok) {
      setError(result.error ?? "Failed to load member profile.");
      setDetail(null);
    } else {
      setDetail(result);
    }

    setLoading(false);
  }, [supabase, userId]);

  useLoadOnMount(loadMember);

  const relatedById = useMemo(
    () =>
      new Map(
        (detail?.related_profiles ?? []).map((profile) => [
          profile.user_id,
          profile,
        ]),
      ),
    [detail],
  );

  // Resets when the member's data reloads, so a stale page number
  // cannot leave the list looking empty.
  const { page, setPage } = usePagination(detail?.matches.length ?? 0);

  const profile = detail?.profile ?? null;
  const authUser = detail?.auth_user ?? null;
  const photos = profile?.photos?.filter(Boolean) ?? [];

  /* A message says who it was with, not which row joins the two people. */
  const peerOfMatch = useCallback(
    (matchId: string) => {
      const match = detail?.matches.find((row) => row.id === matchId);
      if (!match || !detail?.profile) return "Someone";

      const peerId =
        match.user1_id === detail.profile.user_id ? match.user2_id : match.user1_id;

      return displayName(relatedById.get(peerId), peerId);
    },
    [detail, relatedById],
  );

  const matchMessagesByMatch = useMemo(() => {
    const grouped = new Map<string, MessageRow[]>();
    for (const message of detail?.match_messages ?? []) {
      grouped.set(message.match_id, [
        ...(grouped.get(message.match_id) ?? []),
        message,
      ]);
    }
    return grouped;
  }, [detail]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        Loading member profile...
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Button variant="outline" render={<Link href="/members" />}>
          <ArrowLeft className="mr-2 size-4" />
          Members
        </Button>
        <div className="text-destructive">{error}</div>
      </div>
    );
  }

  if (!detail || !profile) {
    return (
      <div className="space-y-6">
        <Button variant="outline" render={<Link href="/members" />}>
          <ArrowLeft className="mr-2 size-4" />
          Members
        </Button>
        <div className="text-muted-foreground">No profile row found.</div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4">
          {photos[0] ? (
            <img
              src={photos[0]}
              alt={profile.name || profile.email || "Profile photo"}
              className="h-24 w-24 object-cover"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center border border-foreground/[0.06] bg-muted">
              <UserRound className="size-8 text-muted-foreground" />
            </div>
          )}
          <div>
            <Button
              variant="ghost"
              className="mb-3 px-0 text-[0.86rem]"
              render={<Link href="/members" />}
            >
              <ArrowLeft className="mr-2 size-4" />
              Members
            </Button>
            <h1 className="text-[1.6rem] font-medium tracking-tight">
              {profile.name || "Unnamed User"}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.92rem] text-muted-foreground">
              <span>{profile.email || authUser?.email || "No email"}</span>
              {/* From the heartbeat, not the is_online column — that was a
                  latch nothing ever cleared. See lib/presence. */}
              <Badge variant={isOnline(profile.last_active) ? "default" : "secondary"}>
                {isOnline(profile.last_active) ? "Online" : "Offline"}
              </Badge>
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={loadMember}
          className="border-foreground/[0.06] text-[0.86rem]"
        >
          <RefreshCw className="mr-2 size-4" />
          Refresh
        </Button>
      </div>

      <MemberActions
        userId={profile.user_id}
        state={{
          suspended_at: profile.suspended_at ?? null,
          face_verified_at: profile.face_verified_at ?? null,
          phone_verified_at: profile.phone_verified_at ?? null,
          premium_until: profile.premium_until ?? null,
          published_at: profile.published_at ?? null,
        }}
        onDone={loadMember}
      />

      <ViewAsUser userId={profile.user_id} />

      <Adjustments userId={profile.user_id} />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Matches" value={detail.matches.length} icon={Heart} />
        <StatCard
          title="Messages"
          value={detail.match_messages.length}
          icon={MessageSquare}
        />
        <StatCard
          title="Likes"
          value={`${detail.likes_sent.length} / ${detail.likes_received.length}`}
          icon={Heart}
        />
        <StatCard
          title="Passes"
          value={`${detail.passes_sent.length} / ${detail.passes_received.length}`}
          icon={X}
        />
      </div>

      <RoseWallet userId={userId} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-8">
          <Section title="Photos" count={photos.length}>
            {photos.length === 0 ? (
              <div className="text-[0.92rem] text-muted-foreground">
                No photos uploaded.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <PagedList
                  items={photos}
                  perPage={12}
                  className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                >
                  {(photo, index) => (
                    <a
                      key={photo}
                      href={photo}
                      target="_blank"
                      rel="noreferrer"
                      className="group block overflow-hidden border border-foreground/[0.06] bg-card"
                    >
                      <img
                        src={photo}
                        alt={`${profile.name || "User"} photo ${index + 1}`}
                        className="aspect-[4/5] w-full object-cover transition-transform group-hover:scale-[1.02]"
                      />
                    </a>
                  )}
                </PagedList>
              </div>
            )}
          </Section>

          <Section title="Stories" count={detail.stories.length}>
            {detail.stories.length === 0 ? (
              <div className="text-[0.92rem] text-muted-foreground">
                No stories found.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <PagedList
                  items={detail.stories}
                  perPage={12}
                  className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
                >
                  {(story) => (
                    <a
                      key={story.id}
                      href={story.photo_url}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden border border-foreground/[0.06] bg-card"
                    >
                      <img
                        src={story.photo_url}
                        alt={`Story ${story.id}`}
                        className="aspect-[9/16] w-full object-cover"
                      />
                      <div className="space-y-1 p-3 text-[0.86rem] text-muted-foreground">
                        <div>Created {formatDateTime(story.created_at)}</div>
                        <div>Expires {formatDateTime(story.expires_at)}</div>
                      </div>
                    </a>
                  )}
                </PagedList>
              </div>
            )}
          </Section>

          <Section title="Matches" count={detail.matches.length}>
            {detail.matches.length === 0 ? (
              <div className="text-[0.92rem] text-muted-foreground">
                No matches found.
              </div>
            ) : (
              <div className="space-y-4">
                <>
                  {paginate(detail?.matches ?? [], page).map((match) => {
                    const peerId =
                      match.user1_id === profile.user_id
                        ? match.user2_id
                        : match.user1_id;
                    const peer = relatedById.get(peerId);
                    const messages = matchMessagesByMatch.get(match.id) ?? [];

                    return (
                      <div
                        key={match.id}
                        className="border border-foreground/[0.06] p-4"
                      >
                        <PersonRow
                          profile={peer}
                          fallbackId={peerId}
                          meta={`${messages.length} messages`}
                        />
                        <div className="mt-3 grid gap-2 text-[0.86rem] text-muted-foreground sm:grid-cols-2">
                          <div>Matched {formatDateTime(match.created_at)}</div>
                          <div>
                            Last message {formatDateTime(match.last_message_at)}
                          </div>
                        </div>
                        {messages[0] && (
                          <div className="mt-3 border-t border-foreground/[0.06] pt-3 text-[0.92rem]">
                            <div className="mb-1 text-[0.86rem] uppercase tracking-[0.16em] text-muted-foreground">
                              Latest Message
                            </div>
                            <p className="line-clamp-3 text-muted-foreground">
                              {messages[0].content}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <Pagination
                    page={page}
                    total={detail?.matches.length ?? 0}
                    onPage={setPage}
                  />
                </>
              </div>
            )}
          </Section>

          <Section title="Their messages" count={detail.messages_sent.length}>
            {detail.messages_sent.length === 0 ? (
              <div className="text-[0.92rem] text-muted-foreground">
                No sent messages.
              </div>
            ) : (
              <div className="space-y-3">
                <PagedList
                  items={detail.messages_sent}
                  perPage={25}
                  className="space-y-3"
                >
                  {(message) => (
                    <div
                      key={message.id}
                      className="border border-foreground/[0.06] p-3"
                    >
                      <div className="mb-2 flex justify-between gap-3 text-[0.86rem] text-muted-foreground">
                        <span>With {peerOfMatch(message.match_id)}</span>
                        <span>{formatDateTime(message.created_at)}</span>
                      </div>
                      <p className="text-[0.92rem]">{message.content}</p>
                    </div>
                  )}
                </PagedList>
              </div>
            )}
          </Section>
        </div>

        <aside className="space-y-6">
          <Card className="border-foreground/[0.06] bg-card">
            <CardHeader>
              <CardTitle>Profile</CardTitle>
              <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
                What this member filled in about themselves.
              </p>
            </CardHeader>
            <CardContent className="space-y-4 text-[0.92rem]">
              <div>
                <div className="text-[0.86rem] uppercase tracking-[0.16em] text-muted-foreground">
                  Bio
                </div>
                <p className="mt-1 text-muted-foreground">
                  {profile.bio || "No bio set."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[0.86rem] uppercase tracking-[0.16em] text-muted-foreground">
                    Age
                  </div>
                  <div>{profile.age ?? "Not set"}</div>
                </div>
                <div>
                  <div className="text-[0.86rem] uppercase tracking-[0.16em] text-muted-foreground">
                    Gender
                  </div>
                  <div className="capitalize">
                    {profile.gender || "Not set"}
                  </div>
                </div>
                <div>
                  <div className="text-[0.86rem] uppercase tracking-[0.16em] text-muted-foreground">
                    Interested In
                  </div>
                  <div className="capitalize">
                    {profile.interested_in || "everyone"}
                  </div>
                </div>
                <div>
                  <div className="text-[0.86rem] uppercase tracking-[0.16em] text-muted-foreground">
                    Search Radius
                  </div>
                  <div>{profile.search_radius ?? 10} km</div>
                </div>
              </div>
              <div>
                <div className="text-[0.86rem] uppercase tracking-[0.16em] text-muted-foreground">
                  Activity
                </div>
                <div>Joined {formatDateTime(profile.created_at)}</div>
                <div>Last active {formatDateTime(profile.last_active)}</div>
              </div>
              <div>
                <div className="text-[0.86rem] uppercase tracking-[0.16em] text-muted-foreground">
                  Location
                </div>
                {profile.latitude != null && profile.longitude != null ? (
                  <div className="flex items-center gap-2">
                    <MapPin className="size-4" />
                    <span>
                      {profile.latitude.toFixed(5)},{" "}
                      {profile.longitude.toFixed(5)}
                    </span>
                  </div>
                ) : (
                  <div>Not set</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-foreground/[0.06] bg-card">
            <CardHeader>
              <CardTitle>Likes</CardTitle>
              <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
                Who they have liked, and who has liked them back.
              </p>
            </CardHeader>
            <CardContent>
              <Section title="Sent" count={detail.likes_sent.length}>
                <PagedList
                  items={detail.likes_sent}
                  perPage={8}
                  className="space-y-2"
                >
                  {(like) => (
                    <PersonRow
                      key={like.id}
                      profile={relatedById.get(like.liked_id)}
                      fallbackId={like.liked_id}
                      meta={formatDateTime(like.created_at)}
                    />
                  )}
                </PagedList>
              </Section>
              <div className="mt-6">
                <Section title="Received" count={detail.likes_received.length}>
                  <PagedList
                    items={detail.likes_received}
                    perPage={8}
                    className="space-y-2"
                  >
                    {(like) => (
                      <PersonRow
                        key={like.id}
                        profile={relatedById.get(like.liker_id)}
                        fallbackId={like.liker_id}
                        meta={formatDateTime(like.created_at)}
                      />
                    )}
                  </PagedList>
                </Section>
              </div>
            </CardContent>
          </Card>

          <Card className="border-foreground/[0.06] bg-card">
            <CardHeader>
              <CardTitle>Encounters</CardTitle>
              <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
                People they have been physically near. No place or time is
                recorded — only how often.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <Section title="Started" count={detail.encounters_started.length}>
                <PagedList
                  items={detail.encounters_started}
                  perPage={8}
                  className="space-y-2"
                >
                  {(encounter) => (
                    <PersonRow
                      key={encounter.id}
                      profile={relatedById.get(
                        encounter.encountered_user_id || "",
                      )}
                      fallbackId={encounter.encountered_user_id || ""}
                      meta={formatDateTime(encounter.created_at)}
                    />
                  )}
                </PagedList>
              </Section>
              <Section
                title="Received"
                count={detail.encounters_received.length}
              >
                <PagedList
                  items={detail.encounters_received}
                  perPage={8}
                  className="space-y-2"
                >
                  {(encounter) => (
                    <PersonRow
                      key={encounter.id}
                      profile={relatedById.get(encounter.user_id || "")}
                      fallbackId={encounter.user_id || ""}
                      meta={formatDateTime(encounter.created_at)}
                    />
                  )}
                </PagedList>
              </Section>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
