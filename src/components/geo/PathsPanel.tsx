"use client";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SwitchRow } from "@/components/ui/switch";
import {
  PageSkeleton,
  Section,
  SettingList,
  SettingRow,
  Explainer,
} from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";
import { adminFetch } from "@/lib/adminFetch";
import { useLoadOnMount } from "@/lib/useLoadOnMount";

/**
 * The live tuning knobs for Paths Crossed.
 *
 * These are the real paths_settings row. Changing the radius here
 * changes what the pairing job counts as a crossing on its next run —
 * for everybody, with no app release. Nothing has an UPDATE policy on
 * the table, so every write goes through /api/paths-settings with the
 * service role behind an admin check.
 */

type Settings = {
  crossing_radius_m: number;
  max_accuracy_m: number;
  max_time_gap_min: number;
  ping_retention_hours: number;
  share_deck_budget: boolean;
};

const FIELDS: {
  key: keyof Omit<Settings, "share_deck_budget">;
  anchor: string;
  label: string;
  hint: string;
  unit: string;
  section: string;
}[] = [
  {
    key: "crossing_radius_m",
    anchor: "crossing-radius",
    label: "How close they must be",
    hint: "How close two people must be for it to count as having crossed paths.",
    unit: "metres",
    section: "What counts",
  },
  {
    key: "max_accuracy_m",
    anchor: "max-accuracy",
    label: "How accurate the GPS must be",
    hint: "A GPS reading vaguer than this is thrown away rather than trusted. Keep it well under twice the radius, or you are counting crossings the data cannot show.",
    unit: "metres",
    section: "What counts",
  },
  {
    key: "max_time_gap_min",
    anchor: "time-gap",
    label: "How close in time",
    hint: "How far apart two readings may be and still count as the same moment. Raise this and people who were there hours apart begin to pair.",
    unit: "minutes",
    section: "What counts",
  },
  {
    key: "ping_retention_hours",
    anchor: "retention",
    label: "How long locations are kept",
    hint: "How long a posted position is kept before deletion. This is location history — the shortest window that still lets pairing work is the right one.",
    unit: "hours",
    section: "Privacy",
  },
];

const SECTIONS = ["What counts", "Privacy"];

/*
 * What each group of settings is for, in words rather than field names.
 *
 * The labels were written from the code's side — "The Gate", "Worst
 * Usable Fix", "Same Moment", "Position Retention". Every one of those
 * names a thing the developer was thinking about rather than the
 * question the admin is asking, which is how close, how accurate, how
 * long. The sentence under each group is what makes the numbers
 * adjustable with any confidence.
 */
const SECTION_COPY: Record<string, { title: string; hint: string }> = {
  "What counts": {
    title: "What counts as crossing paths",
    hint: "All three have to be true at once. Loosen any of them and more people appear in each other's Paths — including some who were never really near each other.",
  },
  Privacy: {
    title: "How long locations are kept",
    hint: "The most sensitive thing stored here. Pairing only needs the last few minutes, so the shortest window that still works is the right one.",
  },
};

export function PathsPanel() {
  const toast = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [shared, setShared] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<{ settings: Settings }>("/api/paths-settings");

    if (error || !data) {
      setError(error ??"Failed to load Paths settings.");
      setLoading(false);
      return;
    }

    setSettings(data.settings);
    setDraft(
      Object.fromEntries(
        FIELDS.map((field) => [field.key, String(data.settings[field.key] ??"")]),
      ),
    );
    setShared(data.settings.share_deck_budget);
    setLoading(false);
  }, []);

  useLoadOnMount(load);

  const dirty =
    settings !== null &&
    (FIELDS.some((field) => draft[field.key] !== String(settings[field.key])) ||
      shared !== settings.share_deck_budget);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);

    const body: Record<string, unknown> = Object.fromEntries(
      FIELDS.map((field) => [field.key, Number(draft[field.key])]),
    );
    body.share_deck_budget = shared;

    const { error } = await adminFetch("/api/paths-settings", {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    if (error) {
      setError(error);
      toast.error({ title: "Could not save", body: error });
    } else {
      toast.success({
        title: "Saved",
        body: "The next pairing run uses these.",
      });
      await load();
    }

    setSaving(false);
  }, [draft, shared, load, toast]);

  return (
    <div className="w-full space-y-4">
      {/*
        No PageHeader here.

        This panel used to render its own, inside a page that already
        has one — so the Paths tab showed two stacked titles, "Location"
        above "Paths Crossed". The page owns the header; this owns the
        settings. The Save button moved to the bottom, next to the last
        thing you change rather than at the top before you change
        anything.
      */}
      <Explainer>
        Phones quietly report where they are. Every few minutes the server
        compares them, and any two people who were close enough at close
        enough a time are recorded as having crossed paths — which is what
        puts them in each other&apos;s Paths tab in the app.
      </Explainer>

      {error && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/8 px-3.5 py-2.5 text-[0.92rem] text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <PageSkeleton sections={3} />
      ) : (
        <>
          {SECTIONS.map((section) => (
            <Section
              key={section}
              title={SECTION_COPY[section].title}
              hint={SECTION_COPY[section].hint}
            >
              <SettingList>
                {FIELDS.filter((field) => field.section === section).map((field) => (
                  <SettingRow
                    key={field.key}
                    id={field.anchor}
                    label={field.label}
                    hint={field.hint}
                    control={
                      <>
                        <Input
                          type="number"
                          value={draft[field.key] ??""}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              [field.key]: event.target.value,
                            }))
                          }
                          className="w-24 text-right tnum"
                        />
                        <span className="w-14 text-[0.86rem] text-muted-foreground">
                          {field.unit}
                        </span>
                      </>
                    }
                  />
                ))}
              </SettingList>
            </Section>
          ))}

          {/* Kept apart from the numbers because it is a different kind of
              decision: the others tune the feature, this one changes what
              the feature costs the people using it. */}
          <Section
            title="Likes from Paths"
            hint="Whether a Paths like uses one of their daily swipes."
          >
            <SwitchRow
              checked={shared}
              onCheckedChange={setShared}
              label="Share the daily swipe limit"
              hint="On: it spends a swipe. Off: Paths has its own allowance."
            />

            {shared && (
              <p className="mt-2 rounded-xl border border-warning/25 bg-warning/8 px-3.5 py-2.5 text-[0.86rem] text-warning">
                While this is on, someone who runs out of swipes cannot like
                anyone from Paths either.
              </p>
            )}
          </Section>

          {/* At the bottom, after the settings rather than above them.
              Nothing here saves on its own, so the button belongs where
              you finish rather than where you start. */}
          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={!dirty || saving || loading}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
            {dirty && !saving && (
              <span className="text-[0.86rem] text-muted-foreground">
                Unsaved changes.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
