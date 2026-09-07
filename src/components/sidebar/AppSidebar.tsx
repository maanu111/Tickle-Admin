"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
  Activity,
  Users,
  Heart,
  ShieldAlert,
  MapPin,
  KeyRound,
  MessageSquare,
  Sparkles,
  Store,
  Puzzle,
  LogOut,
  ListChecks,
  Coins,
  Ticket,
  Flower2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/*
 * One rail.
 *
 * There were two, and the reason was real at the time: twenty-eight
 * destinations did not fit in a single column on a laptop, and a nav you
 * have to scroll is the one thing on a screen that should never need it.
 * Splitting them by kind — what you *watch* on the left, what you *set*
 * on the right — at least made the split memorable.
 *
 * Merging the pages settled it. Twelve destinations fit in one column
 * with room to spare, and two rails were costing more than they bought:
 * a quarter of the window given to chrome, the content squeezed into the
 * middle, and every screen asking which side a thing lived on before you
 * could look for it.
 *
 * The old split survives as the grouping below — watched things first,
 * then the things you set — separated by rules rather than by distance.
 */

type NavItem = {
  name: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
};

/**
 * The whole panel, in the order somebody works through it.
 *
 * Live first: what is happening and who is doing it. Then moderation,
 * which is the daily job. Then the settings, which are visited when a
 * decision needs changing rather than every day.
 */
const NAV: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Live",
    items: [
      { name: "Pulse", url: "/", icon: Activity },
      { name: "Members", url: "/members", icon: Users },
      { name: "Connections", url: "/connections", icon: Heart },
    ],
  },
  {
    heading: "Places",
    items: [
      { name: "Hearts", url: "/hearts", icon: Sparkles },
      { name: "Places", url: "/places", icon: Store },
      { name: "Location", url: "/geo", icon: MapPin },
    ],
  },
  {
    heading: "Moderation",
    items: [
      // Reports, the queue, patterns, tickets, verification and the
      // day's posts: one job, one screen.
      { name: "Moderation", url: "/safety", icon: ShieldAlert },
    ],
  },
  {
    heading: "Money",
    items: [
      // Roses first: it is the currency everything else is priced in.
      { name: "Roses", url: "/roses", icon: Flower2 },
      { name: "Plans & money", url: "/plans", icon: Coins },
      // Codes had a tab inside Plans, which buried a screen that is
      // looked at on its own — promo campaigns and invite rewards are
      // not something you go to the pricing page to find.
      { name: "Codes & invites", url: "/codes", icon: Ticket },
    ],
  },
  {
    heading: "Rules",
    items: [
      { name: "Matching", url: "/compatibility", icon: Puzzle },
      // Questions, the job list and the filters over them are one subject.
      { name: "Profile", url: "/fields", icon: ListChecks },
      { name: "Messaging", url: "/messaging", icon: MessageSquare },
      { name: "Access", url: "/access", icon: KeyRound },
    ],
  },
];

function isCurrent(pathname: string, url: string): boolean {
  //"/" would otherwise prefix-match every route in the panel.
  return url === "/" ? pathname === "/" : pathname.startsWith(url);
}

function NavLink({ item, current }: { item: NavItem; current: boolean }) {
  return (
    <Link
      href={item.url}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2.5 py-[0.32rem] text-[1rem] transition-colors duration-150",
        current
          ? "bg-primary font-medium text-primary-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <item.icon className="size-4 shrink-0" />
      <span className="truncate">{item.name}</span>
    </Link>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !alive) return;

      const { data: profile } = await supabase
        .from("admin_profiles")
        .select("display_name, role")
        .eq("id", user.id)
        .single();

      if (alive) {
        setUser({
          name: profile?.display_name || "Admin",
          role: profile?.role || "admin",
        });
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, [supabase]);

  const signOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    /*
     * Fixed, and it never scrolls.
     *
     * `fixed` rather than `sticky`: a sticky element still lives in the
     * document flow, so it can be pushed by a tall sibling and it moves
     * with an overscroll bounce. overflow-hidden rather than auto, so a
     * regression shows up as clipping during review instead of quietly
     * reintroducing a scrollbar in front of users.
     */
    <aside className="fixed top-0 left-0 flex h-screen w-[13rem] flex-col overflow-hidden border-r border-sidebar-border px-3 py-4">
      {/*
       * The logo block. px-2.5 matches NavLink's padding exactly and the
       * mark is the size of a nav icon, so the logo, every icon below it
       * and every label line up on two vertical edges.
       */}
      <Link href="/" className="flex items-center gap-2.5 px-2.5 py-1">
        <Image
          src="/tickle.png"
          alt=""
          width={72}
          height={72}
          priority
          className="size-6 shrink-0 object-contain"
        />
        <span className="text-[1rem] font-semibold tracking-tight">TICKLE</span>
      </Link>

      <nav className="mt-3 flex min-h-0 flex-1 flex-col gap-0.5">
        {NAV.map((group) => (
          /*
           * No group heading. Naming five clusters costs five rows of
           * text for categories nobody navigates by — people look for
           * "Members", not for "Live". The grouping survives as a rule
           * and a gap, which reads as a group without spending a line
           * saying so.
           */
          <div
            key={group.heading}
            className="space-y-0.5 not-first:mt-3 not-first:border-t not-first:border-sidebar-border not-first:pt-3"
          >
            {group.items.map((item) => (
              <NavLink
                key={item.url}
                item={item}
                current={isCurrent(pathname, item.url)}
              />
            ))}
          </div>
        ))}
      </nav>

      {/*
       * Who is signed in, above the way out.
       *
       * The name gets two lines rather than one truncating line — it is
       * the one piece of text here whose whole job is to be read, and
       * `break-all` because an email-style name has no spaces to break
       * at. `title` keeps the full string reachable for the very long.
       */}
      <div className="mt-3 border-t border-sidebar-border px-2.5 pt-3 pb-1">
        <p
          title={user?.name ?? "Admin"}
          className="line-clamp-2 text-[0.92rem] leading-snug font-medium break-all"
        >
          {user?.name ?? "Admin"}
        </p>
        <p className="mt-0.5 truncate text-[0.8rem] text-muted-foreground">
          {user?.role ?? "admin"}
        </p>
      </div>

      {/* Sign out is the last thing anyone does and the one destructive
          control here, so it sits apart from the links. */}
      <button
        type="button"
        onClick={signOut}
        className="flex items-center gap-2.5 rounded-lg px-2.5 py-[0.32rem] text-[1rem] text-sidebar-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <LogOut className="size-4 shrink-0" />
        <span>Sign out</span>
      </button>
    </aside>
  );
}
