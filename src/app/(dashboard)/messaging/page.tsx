"use client";
import { useCallback, useState } from "react";
import { PagedList } from "@/components/ui/paged-list";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, RefreshCw } from "lucide-react";
import { Select } from "@/components/ui/select";
import { RulesEditor } from "@/components/RulesEditor";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { PageHeader, Explainer } from "@/components/ui/page";
import { Segmented } from "@/components/ui/select";
import { MessageStreamPanel } from "@/components/messaging/MessageStreamPanel";
import { BroadcastPanel } from "@/components/messaging/BroadcastPanel";
import { useSearchParams } from "next/navigation";

/**
 * The messaging levers.
 *
 * Everything here changes what the app offers on its next launch, with
 * no build in between — which is the point of the spec calling these
 *"dynamically configured".
 *
 * There is no message content on this page, and no route that would
 * return any. A panel that can read disappearing messages has undone the
 * feature it is configuring.
 */

type Settings = {
  default_retention: string;
  save_price_min: number;
  save_price_max: number;
  save_sender_share: number;
  voice_max_seconds: number;
  edit_window: string;
  unsend_window: string;
};

type RetentionOption = {
  id: string;
  key: string;
  label: string;
  duration: string | null;
  view_budget: number | null;
  active: boolean;
};

type GlimpseOption = { id: string; ms: number; label: string; active: boolean };

type Payload = {
  settings: Settings;
  retention: RetentionOption[];
  glimpse: GlimpseOption[];
  volume: { total: number; byKind: Record<string, number>; saved: number };
  captures: number;
};

type Tab = "stream" | "rules" | "announce";

const TABS: { value: Tab; label: string }[] = [
  { value: "stream", label: "Conversations" },
  { value: "rules", label: "Rules" },
  { value: "announce", label: "Announcements" },
];

const BLURB: Record<Tab, string> = {
  stream:
    "Conversations as the two people saw them. Read only — nothing here can be changed.",
  rules:
    "How long a message lasts before it disappears, and what members are allowed to send.",
  announce:
    "Send a notification to everybody, or to one group. It reaches real phones straight away.",
};

export default function MessagingPage() {
  const searchParams = useSearchParams();
  /*
   * Checked against the list, not against one name.
   *
   * This tested only for "rules", so ?tab=announce fell through to the
   * conversation stream — a link to the announcement composer landed on
   * a different screen with no sign anything had gone wrong.
   */
  const [tab, setTab] = useState<Tab>(() => {
    const asked = searchParams.get("tab") ?? "";
    return TABS.some((entry) => entry.value === asked) ? (asked as Tab) : "stream";
  });
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newHours, setNewHours] = useState("");
  const [newViews, setNewViews] = useState("");
  const [newGlimpse, setNewGlimpse] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<Payload>("/api/messaging");

    if (error) setError(error);
    else setData(data ?? null);

    setLoading(false);
  }, []);

  useLoadOnMount(load);

  const patch = useCallback(
    async (update: Record<string, unknown>) => {
      setBusy(true);

      const { error } = await adminFetch("/api/messaging", {
        method: "PATCH",
        body: JSON.stringify(update),
      });

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  const add = useCallback(
    async (payload: Record<string, unknown>) => {
      setBusy(true);

      const { error } = await adminFetch("/api/messaging", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  const retire = useCallback(
    async (entity: string, id: string) => {
      setBusy(true);

      const { error } = await adminFetch(
        `/api/messaging?entity=${entity}&id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  const settings = data?.settings;

  return (
    <div className="space-y-6">
      {/* PageHeader is already a row with its actions on the right; the
          extra flex wrapper around it did nothing but nest one. */}
      <PageHeader
        title="Messaging"
        description="What members send each other, and the rules over it."
        actions={
          <>
            <Segmented value={tab} onChange={setTab} options={TABS} />
            {tab === "rules" && (
              <Button
                variant="secondary"
                size="icon"
                onClick={load}
                disabled={loading}
                aria-label="Refresh"
              >
                <RefreshCw className={loading ? "animate-spin" : undefined} />
              </Button>
            )}
          </>
        }
      />

      <Explainer>{BLURB[tab]}</Explainer>

      {tab === "stream" && <MessageStreamPanel />}

      {tab === "announce" && <BroadcastPanel />}

      {tab === "rules" && (
        <>
          {error && (
            <Card className="border-destructive">
              <CardContent className="pt-6 text-[0.92rem] text-destructive">
                {error}
              </CardContent>
            </Card>
          )}

          {data && (
            <div className="grid gap-4 md:grid-cols-4">
              <Stat label="Messages sent" value={data.volume.total} />
              <Stat label="Photos paid to keep" value={data.volume.saved} />
              <Stat label="Voice notes" value={data.volume.byKind.voice ?? 0} />
              <Stat label="Times somebody screenshotted" value={data.captures} />
            </div>
          )}

          {settings && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">What members can send</CardTitle>
                <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
                  How long a voice note can run, how long somebody has to fix a
                  typo or take a message back, and how quickly they can send.
                </p>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field
                  label="Voice note length"
                  hint="In seconds. Somewhere between 60 and 120 works well."
                  value={settings.voice_max_seconds}
                  onCommit={(value) => patch({ voice_max_seconds: value })}
                  disabled={busy}
                />
                <Field
                  label="Edit window"
                  hint="How many minutes someone has to fix a typo after sending. Set it to 0 to turn editing off — the Edit option stops appearing."
                  value={minutesOf(settings.edit_window)}
                  onCommit={(value) => patch({ edit_window_minutes: value })}
                  disabled={busy}
                />
                <Field
                  label="Unsend window"
                  hint="How many minutes someone has to take a message back. Up to a day. Set it to 0 to turn unsending off. A message the other person paid to save can never be unsent, whatever this says."
                  value={minutesOf(settings.unsend_window, 60)}
                  onCommit={(value) => patch({ unsend_window_minutes: value })}
                  disabled={busy}
                />

                <div className="space-y-1">
                  <label className="text-[0.92rem] font-medium">
                    Default retention
                  </label>
                  <Select
                    value={settings.default_retention}
                    onChange={(next) => patch({ default_retention: next })}
                    disabled={busy}
                    options={(data?.retention ?? [])
                      .filter((option) => option.active)
                      .map((option) => ({
                        value: option.key,
                        label: option.label,
                      }))}
                    className="w-full"
                  />
                  <p className="text-[1rem] leading-relaxed text-muted-foreground">
                    What a message gets when the sender does not choose.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                How long messages stay
              </CardTitle>
              <p className="text-[0.92rem] leading-relaxed text-muted-foreground">
                The choices a member gets for making a message disappear — after
                a set time, or after it has been opened a set number of times.
                Retiring one stops it being offered; conversations already using
                it keep it.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <PagedList
                  items={data?.retention ?? []}
                  perPage={24}
                  className="flex flex-wrap gap-2"
                >
                  {(option) => (
                    <div
                      key={option.id}
                      className={
                        option.active
                          ? "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.92rem]"
                          : "flex items-center gap-2 rounded-full border border-dashed px-3 py-1.5 text-[0.92rem] text-muted-foreground line-through"
                      }
                    >
                      <span>{option.label}</span>
                      <Badge variant="secondary" className="text-[0.86rem]">
                        {option.view_budget != null
                          ? `${option.view_budget} view`
                          : "timed"}
                      </Badge>
                      {option.active && (
                        <button
                          type="button"
                          onClick={() => retire("retention", option.id)}
                          disabled={busy}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  )}
                </PagedList>
              </div>

              <div className="flex flex-wrap gap-2">
                <Input
                  value={newKey}
                  onChange={(event) => setNewKey(event.target.value)}
                  placeholder="Short name, like 3d"
                  className="h-8 w-32"
                />
                <Input
                  value={newLabel}
                  onChange={(event) => setNewLabel(event.target.value)}
                  placeholder="Label"
                  className="h-8 w-36"
                />
                <Input
                  value={newHours}
                  onChange={(event) => {
                    setNewHours(event.target.value);
                    if (event.target.value) setNewViews("");
                  }}
                  placeholder="hours"
                  type="number"
                  className="h-8 w-24"
                />
                <span className="self-center text-[0.86rem] text-muted-foreground">
                  or
                </span>
                <Input
                  value={newViews}
                  onChange={(event) => {
                    setNewViews(event.target.value);
                    if (event.target.value) setNewHours("");
                  }}
                  placeholder="views"
                  type="number"
                  className="h-8 w-24"
                />
                <Button
                  size="sm"
                  disabled={
                    busy ||
                    !newKey.trim() ||
                    !newLabel.trim() ||
                    (!newHours && !newViews)
                  }
                  onClick={() => {
                    add({
                      entity: "retention",
                      key: newKey.trim(),
                      label: newLabel.trim(),
                      hours: newHours ? Number(newHours) : null,
                      views: newViews ? Number(newViews) : null,
                    });
                    setNewKey("");
                    setNewLabel("");
                    setNewHours("");
                    setNewViews("");
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                How long a peek lasts
              </CardTitle>
              <p className="text-[0.92rem] leading-relaxed text-muted-foreground">
                A Glimpse is a photo the other person sees once, for a moment,
                and then it is gone. These are how long that moment can be, in
                milliseconds — 2000 is two seconds. Long enough to look, not
                long enough to read a phone number off it.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <PagedList
                  items={data?.glimpse ?? []}
                  perPage={24}
                  className="flex flex-wrap gap-2"
                >
                  {(option) => (
                    <div
                      key={option.id}
                      className={
                        option.active
                          ? "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.92rem]"
                          : "flex items-center gap-2 rounded-full border border-dashed px-3 py-1.5 text-[0.92rem] text-muted-foreground line-through"
                      }
                    >
                      <span>{option.label}</span>
                      {option.active && (
                        <button
                          type="button"
                          onClick={() => retire("glimpse", option.id)}
                          disabled={busy}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  )}
                </PagedList>
              </div>

              <div className="flex gap-2">
                <Input
                  value={newGlimpse}
                  onChange={(event) => setNewGlimpse(event.target.value)}
                  placeholder="Milliseconds — 1000 is one second"
                  type="number"
                  className="h-8 w-36"
                />
                <Button
                  size="sm"
                  disabled={busy || !newGlimpse}
                  onClick={() => {
                    add({ entity: "glimpse", ms: Number(newGlimpse) });
                    setNewGlimpse("");
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>
          {/* Messaging rules, which lived on /config while this page —
          also messaging settings — sat separately. */}
          <RulesEditor />
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-[0.92rem] font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-3xl font-bold">
        {value.toLocaleString()}
      </CardContent>
    </Card>
  );
}

/** Commits on blur rather than per keystroke, so a half-typed number never saves. */
function Field({
  label,
  hint,
  value,
  onCommit,
  disabled,
}: {
  label: string;
  hint: string;
  value: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[0.92rem] font-medium">{label}</label>
      <Input
        type="number"
        defaultValue={value}
        disabled={disabled}
        onBlur={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next) && next !== value) onCommit(next);
        }}
        className="h-9"
      />
      <p className="text-[1rem] leading-relaxed text-muted-foreground">
        {hint}
      </p>
    </div>
  );
}

/**
 * Postgres hands intervals back as "00:10:00", and anything of a day or
 * more as "1 day 00:00:00". Only whole minutes matter here.
 *
 * The day part is not optional to handle: the unsend window goes up to
 * 1440 minutes, so saving the maximum and reloading the page would
 * otherwise read "1 day 00:00:00", fail the clock-only pattern, and
 * show the fallback instead of the value just saved.
 *
 * The fallback is a parameter rather than a fixed 10, because the two
 * settings that use this have different defaults.
 */
function minutesOf(interval: string, fallback = 10): number {
  const days = /(\d+)\s+day/.exec(interval ?? "");
  const clock = /(\d+):(\d+):/.exec(interval ?? "");

  if (!clock) return fallback;

  return (
    (days ? Number(days[1]) * 1440 : 0) +
    Number(clock[1]) * 60 +
    Number(clock[2])
  );
}
