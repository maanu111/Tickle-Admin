"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The payload /api/roses returns, and the pieces every rose panel shares.
 *
 * One shape for the whole subject rather than a fetch per panel: the tabs
 * are views of one thing, and six loaders would mean six spinners for a
 * page whose whole point is seeing the currency at once.
 */

export type Pack = {
  id: string;
  key: string;
  label: string;
  amount: number;
  bonus: number;
  price_minor: number;
  currency: string;
  premium_bonus: number;
  product_id: string | null;
  active: boolean;
};

export type Promotion = {
  id: string;
  key: string;
  label: string;
  kind: string;
  value: number;
  pack_key: string | null;
  ends_at: string | null;
  active: boolean;
};

export type PlanRow = {
  key: string;
  label: string;
  signup_roses: number;
  super_like_rose_cost: number;
};

export type Milestone = {
  id: string;
  key: string;
  label: string;
  reward_kind: string;
  reward_value: number;
  active: boolean;
};

export type Mission = {
  id: string;
  city_slug: string | null;
  key: string;
  label: string;
  kind: string;
  reward_kind: string;
  reward_value: number;
  active: boolean;
};

export type Code = {
  id: string;
  code: string;
  label: string;
  reward_kind: string;
  reward_value: number;
  city: string | null;
  max_uses: number | null;
  used: number;
  active: boolean;
};

export type LedgerRow = {
  id: string;
  user_id: string;
  amount: number;
  reason: string;
  target_id: string | null;
  balance_after: number;
  created_at: string;
  name: string;
  target: string | null;
};

export type Attempt = {
  id: string;
  user_id: string;
  platform: string;
  product_id: string;
  status: string;
  error: string | null;
  created_at: string;
};

export type Settings = Record<string, number | string | null> | null;

export type RosePayload = {
  totals: {
    movements: number;
    purchased: number;
    granted: number;
    spent: number;
    circulating: number;
  };
  byReason: Record<string, { count: number; total: number }>;
  superLikes: { total: number; paidWithRoses: number; withNote: number };
  holders: { user_id: string; roses: number; name: string }[];
  recent: LedgerRow[];
  packs: Pack[];
  promotions: Promotion[];
  plans: PlanRow[];
  fairness: Settings;
  heartSettings: Settings;
  milestones: Milestone[];
  missions: Mission[];
  codes: Code[];
  attempts: Attempt[];
};

/** What a PATCH to /api/roses looks like from a panel's point of view. */
export type Patch = (body: Record<string, unknown>) => void;

export type PanelProps = {
  data: RosePayload;
  patch: Patch;
  busy: boolean;
};

export const money = (minor: number, currency = "INR") =>
  `${currency === "INR" ? "₹" : ""}${(minor / 100).toFixed(0)}`;

export const count = (value: number) => value.toLocaleString("en-US");

export function formatDate(value: string) {
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

/**
 * A number that saves when you leave it.
 *
 * Committing on blur rather than per keystroke: a field that saves as you
 * type writes "1", "12" and "125" on the way to 125, and the first two are
 * real settings the app briefly ran on.
 */
export function NumberField({
  value,
  onCommit,
  disabled,
  suffix,
  className,
}: {
  value: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
  suffix?: string;
  className?: string;
}) {
  return (
    <span className="flex items-center gap-2">
      <Input
        key={value}
        type="number"
        defaultValue={value}
        disabled={disabled}
        onBlur={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next) && next !== value) onCommit(next);
        }}
        className={cn("tnum h-9 w-24", className)}
      />
      {suffix && (
        <span className="text-[0.86rem] text-muted-foreground">{suffix}</span>
      )}
    </span>
  );
}

/** A neutral status word. Colour belongs to data here, not to chrome. */
export function Chip({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "on" | "off";
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[0.78rem]",
        tone === "neutral" && "bg-muted text-muted-foreground",
        tone === "on" && "bg-foreground/[0.08] text-foreground",
        tone === "off" && "bg-muted text-muted-foreground line-through",
      )}
    >
      {children}
    </span>
  );
}
