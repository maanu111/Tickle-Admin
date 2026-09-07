import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Users,
  Flower2,
  Heart,
  MessageSquare,
  ShieldAlert,
  Megaphone,
  MapPin,
  KeyRound,
  Settings,
  Sparkles,
  Store,
  Radius,
  Clock,
  Ban,
  UserPlus,
  Database,
  LogOut,
  Search,
  Image,
  Flag,
  BarChart3,
  ScanFace,
  Puzzle,
  Inbox,
  Briefcase,
  ListChecks,
  Timer,
  ScanSearch,
  Target,
  MapPinned,
  Coins,
  SlidersHorizontal,
  Ticket,
  Gavel,
  LifeBuoy,
} from "lucide-react";

/**
 * Everything the panel can do, in one list.
 *
 * This is the difference between a search box and a command palette. A
 * search box finds rows; this finds *the panel itself* — the page that
 * holds a setting, the setting inside it, the action you half-remember
 * existing. An admin who knows what they want to change should never have
 * to remember which of nine pages it lives on.
 *
 * The registry is also the reason that stays true as the panel grows.
 * Adding a page here makes it findable, and a page not added here is
 * invisible to search — which is a loud enough failure to catch in
 * development rather than a quiet one to discover in production.
 */

export type CommandKind = "page" | "section" | "setting" | "action" | "record";

export interface CommandEntry {
  id: string;
  /** What it is called. Matched first and weighted highest. */
  title: string;
  /** One line of context, shown under the title. Also searched. */
  subtitle?: string;
  /**
   * Words someone might type that do not appear in the title. This is what
   * makes the palette feel like it reads minds: "ban" finding Safety,
   * "30m" finding the heart radius, "fake" finding the seed tools.
   */
  keywords?: string[];
  kind: CommandKind;
  icon: LucideIcon;
  /** Where it lives. Sections and settings deep-link into a page. */
  href?: string;
  /**
   * For the handful of commands that do something rather than go somewhere.
   * A plain string id, so this file stays data and the palette owns the
   * handlers — a registry that imports React is a registry nothing else can
   * safely import.
   */
  run?: "signout";
  /** The page this belongs under, for grouping results. */
  group: string;
}

export const COMMANDS: CommandEntry[] = [
  // ─── Pages ────────────────────────────────────────────────
  {
    id: "page:pulse",
    title: "Pulse",
    subtitle: "Live activity across the app",
    keywords: ["dashboard", "home", "overview", "stats", "activity"],
    kind: "page",
    icon: Activity,
    href: "/",
    group: "Pages",
  },
  {
    id: "page:members",
    title: "Members",
    subtitle: "Every account, real and seeded",
    keywords: ["users", "people", "accounts", "profiles"],
    kind: "page",
    icon: Users,
    href: "/members",
    group: "Pages",
  },
  {
    id: "page:connections",
    title: "Connections",
    subtitle: "Likes, matches and who found whom",
    keywords: ["likes", "matches", "pairs"],
    kind: "page",
    icon: Heart,
    href: "/connections",
    group: "Pages",
  },
  {
    id: "page:hearts",
    title: "Hearts",
    subtitle: "Hearts dropped at venues, and the sparks they made",
    keywords: ["drop", "pick", "venue", "spark", "place", "random match"],
    kind: "page",
    icon: Sparkles,
    href: "/hearts",
    group: "Pages",
  },
  {
    id: "page:places",
    title: "Places",
    subtitle: "Cached venues from Google",
    keywords: ["venues", "google", "cache", "cafe", "locations"],
    kind: "page",
    icon: Store,
    href: "/places",
    group: "Pages",
  },
  {
    id: "page:interest",
    title: "Interest",
    subtitle: "Private comments and Super Likes",
    keywords: ["comment", "super like", "rose", "incoming", "likes received", "abuse"],
    kind: "page",
    icon: Inbox,
    href: "/connections?tab=interest",
    group: "Pages",
  },
  {
    id: "page:dailies",
    title: "Dailies",
    subtitle: "Temporary profile content, live now",
    keywords: ["stories", "daily", "24 hours", "temporary", "expiring", "today"],
    kind: "page",
    icon: Clock,
    href: "/safety?view=dailies",
    group: "Pages",
  },
  {
    id: "page:messages",
    title: "Messages",
    subtitle: "Conversations and reported threads",
    keywords: ["chat", "dm", "conversations"],
    kind: "page",
    icon: MessageSquare,
    href: "/messaging",
    group: "Pages",
  },
  {
    id: "page:compatibility",
    title: "Matching",
    subtitle: "The questions behind a match score, and who gets seen",
    keywords: [
      "match",
      "score",
      "questions",
      "dimensions",
      "compatibility",
      "ai",
      "percent",
      "algorithm",
      "fairness",
      "visibility",
    ],
    kind: "page",
    icon: Puzzle,
    href: "/compatibility",
    group: "Pages",
  },
  {
    id: "page:promos",
    title: "Codes & invites",
    subtitle: "Promo codes and rewards for inviting friends",
    keywords: [
      "promo",
      "code",
      "referral",
      "invite",
      "reward",
      "campaign",
      "discount",
      "milestone",
    ],
    kind: "page",
    icon: Ticket,
    href: "/codes",
    group: "Pages",
  },
  {
    id: "page:filters",
    title: "Filters",
    subtitle: "Which filters are free and which need Premium",
    keywords: ["filter", "free", "premium", "discovery", "tier", "paywall"],
    kind: "page",
    icon: SlidersHorizontal,
    href: "/fields?tab=filters",
    group: "Pages",
  },
  {
    id: "page:venues",
    title: "Venues",
    subtitle: "Where hearts may be dropped",
    keywords: ["venue", "place", "category", "blocked", "radius", "capture", "hospital", "school"],
    kind: "page",
    icon: MapPinned,
    href: "/places",
    group: "Pages",
  },
  {
    id: "page:economy",
    title: "Prices & offers",
    subtitle: "Packs, promotions and Premium pricing",
    keywords: ["pack", "price", "promo", "premium", "trial", "offer", "bonus", "purchase", "hearts", "roses", "economy"],
    kind: "page",
    icon: Coins,
    href: "/plans",
    group: "Pages",
  },
  {
    id: "page:hunt",
    title: "Heart Hunt",
    subtitle: "Platform drops and user heart rules",
    keywords: ["heart", "hunt", "drop", "venue", "reward", "platform", "claim", "promo"],
    kind: "page",
    icon: Target,
    href: "/hearts?tab=hunt",
    group: "Pages",
  },
  {
    id: "page:safety-rules",
    title: "Safety rules",
    subtitle: "Scam patterns and blocked domains",
    keywords: ["scam", "fraud", "phishing", "link", "blocklist", "otp", "crypto", "pattern", "regex"],
    kind: "page",
    icon: ScanSearch,
    href: "/safety?view=patterns",
    group: "Pages",
  },
  {
    id: "page:messaging",
    title: "Messaging",
    subtitle: "Retention, Glimpses, saving prices",
    keywords: ["ephemeral", "disappearing", "retention", "glimpse", "voice", "expiry", "screenshot", "save"],
    kind: "page",
    icon: Timer,
    href: "/messaging",
    group: "Pages",
  },
  {
    id: "page:fields",
    title: "Profile",
    subtitle: "What members fill in about themselves, and what others see",
    keywords: ["prompts", "questions", "options", "interests", "languages", "registry", "labels", "profile fields", "work", "height", "hometown"],
    kind: "page",
    icon: ListChecks,
    href: "/fields",
    group: "Pages",
  },
  {
    id: "page:professions",
    title: "Professions",
    subtitle: "The list behind the work question",
    keywords: ["work", "job", "occupation", "career", "profession", "employment", "industry"],
    kind: "page",
    icon: Briefcase,
    href: "/fields?tab=jobs",
    group: "Pages",
  },
  {
    id: "page:verification",
    title: "Verification",
    subtitle: "Face checks waiting to be reviewed",
    keywords: ["face", "selfie", "verify", "badge", "photo match", "id"],
    kind: "page",
    icon: ScanFace,
    href: "/safety?view=verification",
    group: "Pages",
  },
  {
    id: "page:queue",
    title: "Queue",
    subtitle: "Reports waiting to be reviewed",
    keywords: ["report", "moderation", "queue", "suspend", "ban", "warn", "reverify", "abuse"],
    kind: "page",
    icon: Gavel,
    href: "/safety?view=reports",
    group: "Pages",
  },
  {
    id: "page:tickets",
    title: "Tickets",
    subtitle: "Support conversations",
    keywords: ["support", "ticket", "help", "billing", "complaint"],
    kind: "page",
    icon: LifeBuoy,
    href: "/safety?view=tickets",
    group: "Pages",
  },
  {
    id: "page:safety",
    title: "Safety",
    subtitle: "Reports, blocks and moderation queue",
    keywords: ["reports", "abuse", "moderation", "ban", "block", "flag"],
    kind: "page",
    icon: ShieldAlert,
    href: "/safety",
    group: "Pages",
  },
  {
    id: "page:broadcast",
    title: "Broadcast",
    subtitle: "Send a notification to everyone",
    keywords: ["notification", "push", "announce", "message all"],
    kind: "page",
    icon: Megaphone,
    href: "/messaging?tab=announce",
    group: "Pages",
  },
  {
    id: "page:geo",
    title: "Geo",
    subtitle: "Where people are, on a map",
    keywords: ["map", "location", "spread", "cities"],
    kind: "page",
    icon: MapPin,
    href: "/geo",
    group: "Pages",
  },
  {
    id: "page:access",
    title: "Access",
    subtitle: "Who can sign in to this panel",
    keywords: ["admins", "permissions", "roles", "staff"],
    kind: "page",
    icon: KeyRound,
    href: "/access",
    group: "Pages",
  },
  {
    id: "page:access-roles",
    title: "Roles and permissions",
    subtitle: "What each role is allowed to do",
    keywords: ["role", "permission", "grant", "revoke", "super", "access"],
    kind: "page",
    icon: KeyRound,
    href: "/access?tab=roles",
    group: "Pages",
  },
  {
    id: "page:roses",
    title: "Roses",
    subtitle: "The in-app currency, end to end",
    keywords: ["rose", "roses", "currency", "coins", "credits", "packs", "wallet", "balance", "ledger", "grant", "economy", "money", "iap", "purchase"],
    kind: "page",
    icon: Flower2,
    href: "/roses",
    group: "Pages",
  },

  // Each tab is worth reaching directly — an admin asks for "rose packs"
  // or "grant roses", never for the page that happens to hold them.
  {
    id: "roses:packs",
    title: "Rose packs and prices",
    subtitle: "What a pack costs and what it gives",
    keywords: ["pack", "price", "buy", "iap", "store", "promotion", "bonus"],
    kind: "setting",
    icon: Flower2,
    href: "/roses?tab=money",
    group: "Roses",
  },
  {
    id: "roses:spending",
    title: "What roses buy",
    subtitle: "Super Like, heart, revival and photo-save prices",
    keywords: ["cost", "price", "super like", "revival", "heart", "save", "spend"],
    kind: "setting",
    icon: Flower2,
    href: "/roses?tab=supply",
    group: "Roses",
  },
  {
    id: "roses:earning",
    title: "How roses are earned",
    subtitle: "Signup, referral and mission rewards",
    keywords: ["signup", "referral", "mission", "free", "reward", "bonus"],
    kind: "setting",
    icon: Flower2,
    href: "/roses?tab=supply",
    group: "Roses",
  },
  {
    id: "roses:grants",
    title: "Grant roses to a member",
    subtitle: "Make somebody whole after a failed purchase",
    keywords: ["grant", "give", "refund", "compensate", "support", "deduct", "take back"],
    kind: "setting",
    icon: Flower2,
    href: "/roses?tab=records",
    group: "Roses",
  },
  {
    id: "roses:ledger",
    title: "Rose ledger",
    subtitle: "Every movement of the currency",
    keywords: ["ledger", "history", "audit", "movement", "where did", "transactions"],
    kind: "setting",
    icon: Flower2,
    href: "/roses?tab=records",
    group: "Roses",
  },
  {
    id: "page:plans",
    title: "Plans & money",
    subtitle: "What a membership includes and what it costs",
    keywords: ["plan", "premium", "free", "limit", "entitlement", "subscription", "settings", "config", "money"],
    kind: "page",
    icon: Settings,
    href: "/plans",
    group: "Pages",
  },

  // ─── Settings ─────────────────────────────────────────────
  //
  // Named the way an admin would ask for them, not the way the column is
  // spelled. Someone looking for the gate types "30m" or "radius", never
  // "action_radius_m".
  {
    id: "setting:action-radius",
    title: "Heart radius",
    subtitle: "How close someone must be to drop or pick up a heart",
    keywords: ["30m", "gate", "distance", "action_radius_m", "proximity", "range"],
    kind: "setting",
    icon: Radius,
    href: "/hearts?tab=settings#heart-radius",
    group: "Config",
  },
  {
    id: "setting:heart-ttl",
    title: "Heart lifetime",
    subtitle: "How long a heart stays before it expires",
    keywords: ["ttl", "expiry", "expires", "hours", "heart_ttl"],
    kind: "setting",
    icon: Clock,
    href: "/hearts?tab=settings#heart-ttl",
    group: "Config",
  },
  {
    id: "setting:spark-ttl",
    title: "Spark lifetime",
    subtitle: "How long a spark stays before it disappears",
    keywords: ["ttl", "expiry", "days", "spark_ttl", "random match"],
    kind: "setting",
    icon: Clock,
    href: "/hearts?tab=settings#spark-ttl",
    group: "Config",
  },
  {
    id: "setting:daily-limit",
    title: "Hearts per day",
    subtitle: "How many a person may drop in 24 hours",
    keywords: ["limit", "cap", "rate limit", "max_hearts_per_day", "spam"],
    kind: "setting",
    icon: Ban,
    href: "/hearts?tab=settings#daily-limit",
    group: "Config",
  },
  {
    id: "setting:discovery-radius",
    title: "Discovery radius",
    subtitle: "How far away venues appear on the map",
    keywords: ["3km", "map", "range", "discovery_radius_m", "nearby"],
    kind: "setting",
    icon: Radius,
    href: "/hearts?tab=settings#discovery-radius",
    group: "Config",
  },
  {
    id: "setting:blocked-categories",
    title: "Blocked venue types",
    subtitle: "Where hearts may never be left",
    keywords: ["hospital", "school", "categories", "banned", "blocked_categories"],
    kind: "setting",
    icon: Ban,
    href: "/hearts?tab=settings#blocked-categories",
    group: "Config",
  },
  {
    id: "setting:max-accuracy",
    title: "Worst usable fix",
    subtitle: "How vague a GPS reading may be before it is refused",
    keywords: ["accuracy", "gps", "signal", "weak", "max_accuracy_m", "indoors"],
    kind: "setting",
    icon: Radius,
    href: "/hearts?tab=settings#max-accuracy",
    group: "Config",
  },
  {
    id: "setting:place-cache-ttl",
    title: "Venue cache life",
    subtitle: "How long a cached Google venue is trusted",
    keywords: ["cache", "google", "places", "refresh", "place_cache_ttl", "stale"],
    kind: "setting",
    icon: Clock,
    href: "/hearts?tab=settings#place-cache-ttl",
    group: "Config",
  },

  {
    id: "setting:daily-interactions",
    title: "Likes per day",
    subtitle: "The shared free budget for likes and comments",
    keywords: ["20", "limit", "budget", "free", "interactions", "swipes", "cap"],
    kind: "setting",
    icon: Ban,
    href: "/plans#free-daily-interactions",
    group: "Config",
  },
  {
    id: "setting:daily-comments",
    title: "Comments per day",
    subtitle: "How many private comments a free member may send",
    keywords: ["comment", "message", "free", "allowance"],
    kind: "setting",
    icon: Ban,
    href: "/plans#free-daily-comments",
    group: "Config",
  },
  {
    id: "setting:super-likes",
    title: "Super Likes per day",
    subtitle: "Its own budget, separate from likes",
    keywords: ["super", "star", "allowance", "premium"],
    kind: "setting",
    icon: Sparkles,
    href: "/plans#free-daily-super-likes",
    group: "Config",
  },
  {
    id: "setting:visibility-multiplier",
    title: "Premium visibility",
    subtitle: "How much premium lifts position — never compatibility",
    keywords: ["boost", "premium", "multiplier", "paid", "visibility"],
    kind: "setting",
    icon: Radius,
    href: "/plans#premium-visibility-multiplier",
    group: "Config",
  },

  {
    id: "setting:fresh-start",
    title: "Fresh Start Boost",
    subtitle: "Extra visibility for a member's first days",
    keywords: [
      "fresh start",
      "new user",
      "newcomer",
      "boost",
      "new here",
      "visibility",
      "welcome",
      "first week",
      "onboarding",
      "discover",
      "exposure",
    ],
    kind: "setting",
    icon: Sparkles,
    href: "/compatibility#fresh-start",
    group: "Compatibility",
  },
  {
    id: "setting:pass-cooldown",
    title: "Pass cooldown",
    subtitle: "How long before a passed profile can appear again",
    keywords: ["cooldown", "pass", "reject", "2 days", "4 days", "7 days", "reshow", "second chance"],
    kind: "setting",
    icon: Clock,
    href: "/compatibility#pass-cooldown-1",
    group: "Config",
  },
  {
    id: "setting:exposure-cap",
    title: "Exposure cap",
    subtitle: "How many decks one profile may appear in per day",
    keywords: ["fairness", "rotation", "exposure", "cap", "visibility", "spread"],
    kind: "setting",
    icon: Ban,
    href: "/compatibility#exposure-cap",
    group: "Config",
  },

  // ─── Actions ──────────────────────────────────────────────
  {
    id: "action:add-admin",
    title: "Add an admin",
    subtitle: "Give someone access to this panel",
    keywords: ["invite", "staff", "permission", "new admin"],
    kind: "action",
    icon: UserPlus,
    href: "/access?new=1",
    group: "Actions",
  },
  {
    id: "action:broadcast",
    title: "Send a broadcast",
    subtitle: "Notify every member at once",
    keywords: ["notify", "push", "announce", "everyone"],
    kind: "action",
    icon: Megaphone,
    href: "/messaging?tab=announce&compose=1",
    group: "Actions",
  },
  {
    id: "action:review-reports",
    title: "Review reports",
    subtitle: "Open the moderation queue",
    keywords: ["moderation", "abuse", "queue", "flagged"],
    kind: "action",
    icon: Flag,
    href: "/safety?filter=open",
    group: "Actions",
  },
  {
    id: "action:expire-hearts",
    title: "Expire old hearts now",
    subtitle: "Run the sweep that pg_cron runs every ten minutes",
    keywords: ["cleanup", "cron", "sweep", "expired"],
    kind: "action",
    icon: Database,
    href: "/hearts?action=expire",
    group: "Actions",
  },
  {
    id: "action:photo-audit",
    title: "Photo audit",
    subtitle: "Accounts with no photo, or only one",
    keywords: ["images", "missing", "incomplete", "empty"],
    kind: "action",
    icon: Image,
    href: "/members?filter=no-photos",
    group: "Actions",
  },
  {
    id: "action:weak-profiles",
    title: "Weak profiles",
    subtitle: "Accounts under 40% complete",
    keywords: ["incomplete", "strength", "empty", "unfinished"],
    kind: "action",
    icon: BarChart3,
    href: "/members?filter=weak",
    group: "Actions",
  },
  {
    id: "action:suspend",
    title: "Suspended accounts",
    subtitle: "Who is locked out, and why",
    keywords: ["banned", "ban", "blocked", "locked", "suspension"],
    kind: "action",
    icon: Ban,
    href: "/members?filter=suspended",
    group: "Actions",
  },
  {
    id: "action:sign-out",
    title: "Sign out",
    subtitle: "Leave the admin panel",
    keywords: ["logout", "exit", "leave"],
    kind: "action",
    icon: LogOut,
    run: "signout",
    group: "Actions",
  },

  // ─── Data ─────────────────────────────────────────────────
  //
  // Entry points into search *of* data, distinct from the live record
  // results the palette fetches while typing. These exist so "email" or
  // "phone" leads somewhere even before anything is typed.
  {
    id: "record:find-member",
    title: "Find a member",
    subtitle: "Search by name or email",
    keywords: ["email", "phone", "lookup", "who is", "account"],
    kind: "record",
    icon: Search,
    href: "/members",
    group: "Data",
  },
];

/**
 * Score a command against what has been typed.
 *
 * Deliberately not fuzzy in the Levenshtein sense. An admin panel is used
 * daily by a handful of people who know roughly what things are called, so
 * prefix and substring matching on a good keyword list beats approximate
 * matching that surfaces confident nonsense. Returns null for no match, so
 * the caller filters rather than sorting a list of zeroes.
 */
export function scoreCommand(entry: CommandEntry, query: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const title = entry.title.toLowerCase();
  const subtitle = entry.subtitle?.toLowerCase() ?? "";
  const keywords = entry.keywords ?? [];

  // Exact title, then title prefix: someone typing the whole name of a page
  // means that page, and nothing else should outrank it.
  if (title === q) return 1000;
  if (title.startsWith(q)) return 800;

  // A word inside the title — "radius" finding "Heart radius".
  if (title.split(/\s+/).some((word) => word.startsWith(q))) return 600;
  if (title.includes(q)) return 400;

  // Keywords carry most of the usefulness, so an exact one beats a partial
  // title match on something less relevant.
  if (keywords.some((keyword) => keyword.toLowerCase() === q)) return 500;
  if (keywords.some((keyword) => keyword.toLowerCase().startsWith(q))) return 300;
  if (keywords.some((keyword) => keyword.toLowerCase().includes(q))) return 200;

  if (subtitle.includes(q)) return 100;

  return null;
}

export function searchCommands(query: string, limit = 12): CommandEntry[] {
  if (!query.trim()) {
    // With nothing typed, show the things people actually open — not the
    // first twelve entries in declaration order.
    return COMMANDS.filter((entry) => entry.kind === "page").slice(0, 8);
  }

  return COMMANDS.map((entry) => ({ entry, score: scoreCommand(entry, query) }))
    .filter((row): row is { entry: CommandEntry; score: number } => row.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.entry);
}
