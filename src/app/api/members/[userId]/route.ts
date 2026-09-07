import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/admin";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { userId } = await context.params;

    const [
      authUser,
      profile,
      likesSent,
      likesReceived,
      passesSent,
      passesReceived,
      matches,
      messagesSent,
      stories,
      encountersStarted,
      encountersReceived,
    ] = await Promise.all([
      auth.supabase.auth.admin.getUserById(userId),
      auth.supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      auth.supabase
        .from("likes")
        .select("*")
        .eq("liker_id", userId)
        .order("created_at", { ascending: false }),
      auth.supabase
        .from("likes")
        .select("*")
        .eq("liked_id", userId)
        .order("created_at", { ascending: false }),
      auth.supabase
        .from("passes")
        .select("*")
        .eq("passer_id", userId)
        .order("created_at", { ascending: false }),
      auth.supabase
        .from("passes")
        .select("*")
        .eq("passed_id", userId)
        .order("created_at", { ascending: false }),
      auth.supabase
        .from("matches")
        .select("*")
        .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
        .order("last_message_at", { ascending: false }),
      auth.supabase
        .from("messages")
        .select("*")
        .eq("sender_id", userId)
        .order("created_at", { ascending: false }),
      auth.supabase
        .from("stories")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      auth.supabase
        .from("nearby_encounters")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
      auth.supabase
        .from("nearby_encounters")
        .select("*")
        .eq("encountered_user_id", userId)
        .order("created_at", { ascending: false }),
    ]);

    if (authUser.error) throw authUser.error;
    if (profile.error) throw profile.error;
    if (likesSent.error) throw likesSent.error;
    if (likesReceived.error) throw likesReceived.error;
    if (passesSent.error) throw passesSent.error;
    if (passesReceived.error) throw passesReceived.error;
    if (matches.error) throw matches.error;
    if (messagesSent.error) throw messagesSent.error;
    if (stories.error) throw stories.error;
    if (encountersStarted.error) throw encountersStarted.error;
    if (encountersReceived.error) throw encountersReceived.error;

    const matchRows = matches.data ?? [];
    const relatedUserIds = new Set<string>();
    const matchIds = matchRows.map((match) => match.id);

    for (const like of [...(likesSent.data ?? []), ...(likesReceived.data ?? [])]) {
      relatedUserIds.add(like.liker_id);
      relatedUserIds.add(like.liked_id);
    }
    for (const pass of [
      ...(passesSent.data ?? []),
      ...(passesReceived.data ?? []),
    ]) {
      relatedUserIds.add(pass.passer_id);
      relatedUserIds.add(pass.passed_id);
    }
    for (const match of matchRows) {
      relatedUserIds.add(match.user1_id);
      relatedUserIds.add(match.user2_id);
    }
    for (const encounter of [
      ...(encountersStarted.data ?? []),
      ...(encountersReceived.data ?? []),
    ]) {
      if (encounter.user_id) relatedUserIds.add(encounter.user_id);
      if (encounter.encountered_user_id) {
        relatedUserIds.add(encounter.encountered_user_id);
      }
    }

    const [relatedProfiles, matchMessages] = await Promise.all([
      relatedUserIds.size
        ? auth.supabase
            .from("profiles")
            // last_active, not is_online: presence is derived from the
            // heartbeat now, and the old column is a latch nothing clears.
            .select("user_id, name, email, photos, age, gender, last_active")
            .in("user_id", Array.from(relatedUserIds))
        : Promise.resolve({ data: [], error: null }),
      matchIds.length
        ? auth.supabase
            .from("messages")
            .select("*")
            .in("match_id", matchIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (relatedProfiles.error) throw relatedProfiles.error;
    if (matchMessages.error) throw matchMessages.error;

    return NextResponse.json({
      auth_user: authUser.data.user,
      profile: profile.data,
      related_profiles: relatedProfiles.data ?? [],
      likes_sent: likesSent.data ?? [],
      likes_received: likesReceived.data ?? [],
      passes_sent: passesSent.data ?? [],
      passes_received: passesReceived.data ?? [],
      matches: matchRows,
      messages_sent: messagesSent.data ?? [],
      match_messages: matchMessages.data ?? [],
      stories: stories.data ?? [],
      encounters_started: encountersStarted.data ?? [],
      encounters_received: encountersReceived.data ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load member data.",
      },
      { status: 500 },
    );
  }
}
