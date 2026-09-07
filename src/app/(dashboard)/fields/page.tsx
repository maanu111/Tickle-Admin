"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader, Explainer, PageSkeleton } from "@/components/ui/page";
import { Segmented } from "@/components/ui/select";
import { QuestionsPanel } from "@/components/profile/QuestionsPanel";
import { FiltersPanel } from "@/components/profile/FiltersPanel";
import { JobsPanel } from "@/components/profile/JobsPanel";

/**
 * Everything a profile is made of.
 *
 * Three screens that were always one subject. The questions are what the
 * app asks a member about themselves; the job list is the answers to one
 * of those questions; the filters are how somebody else searches the same
 * answers. Editing a question without seeing whether anybody filters on
 * it was the gap — they are now one screen apart from each other, which
 * is to say no distance at all.
 *
 * One tab visible at a time, deliberately. These are long editors, and
 * stacking three of them makes a screen nobody can find the bottom of.
 */

type Tab = "questions" | "prompts" | "filters" | "jobs";

/*
 * "Questions" was the label here and on the Matching screen, for two
 * different things. These are the fields shown on a profile — work,
 * height, hometown — which other people read. The matching ones are
 * never displayed; they feed a score. Same word, opposite purpose, and
 * no way to tell which screen you wanted.
 */
const TABS: { value: Tab; label: string }[] = [
  { value: "questions", label: "Profile fields" },
  // Prompts were behind a second row of buttons inside the fields panel,
  // which put a whole subject two levels down on a page that already had
  // tabs. One level, four subjects.
  { value: "prompts", label: "Prompts" },
  { value: "filters", label: "Filters" },
  { value: "jobs", label: "Job list" },
];

const BLURB: Record<Tab, string> = {
  questions:
    "What members fill in about themselves, and what other people see on their profile. Changes show next time the app opens.",
  prompts:
    "The openers members answer on their profile, written or spoken. These are read by other people, not scored.",
  filters: "What members can narrow their search by, and which need Premium.",
  jobs: "What members pick from when they say what they do. Retiring one keeps it on profiles that already use it.",
};

export default function ProfilePage() {
  // useSearchParams bails out of prerendering up to the nearest boundary,
  // and a production build fails outright without one.
  return (
    <Suspense fallback={<PageSkeleton sections={2} />}>
      <ProfileView />
    </Suspense>
  );
}

function ProfileView() {
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<Tab>(() => {
    const asked = searchParams.get("tab") as Tab | null;
    return asked && TABS.some((entry) => entry.value === asked) ? asked : "questions";
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Profile"
        description="What members fill in about themselves, and how others search it."
        actions={<Segmented value={tab} onChange={setTab} options={TABS} />}
      />

      <Explainer>{BLURB[tab]}</Explainer>

      {tab === "questions" && <QuestionsPanel view="fields" />}
      {tab === "prompts" && <QuestionsPanel view="prompts" />}
      {tab === "filters" && <FiltersPanel />}
      {tab === "jobs" && <JobsPanel />}
    </div>
  );
}
