/**
 * Whether somebody counts as online.
 *
 * profiles.is_online is not a source of truth. It was written only by a
 * location push and only ever set to true — nothing ever cleared it, so
 * accounts that had not opened the app in two days still read as online.
 *
 * The app now beats last_active once a minute while it is open, and the
 * database derives presence from that in is_present(). This is the same
 * rule, for the panel's own reads.
 *
 * Two minutes, matching the server: the app beats every sixty seconds,
 * so this tolerates one missed beat without flickering somebody offline
 * while they are sitting there.
 */
const WINDOW_MS = 2 * 60 * 1000;

export function isOnline(lastActive: string | null | undefined): boolean {
  if (!lastActive) return false;

  const at = new Date(lastActive).getTime();
  if (Number.isNaN(at)) return false;

  return Date.now() - at < WINDOW_MS;
}
