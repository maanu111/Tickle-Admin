"use client";

import { Suspense, useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/select";
import { Explainer, PageHeader, PageSkeleton } from "@/components/ui/page";
import { RoseOverview, RoseLedger, RosePurchases, RoseSpending } from "@/components/roses/RoseFlow";
import { RoseEarning, RoseGrants, RosePacks } from "@/components/roses/RoseSupply";
import type { RosePayload } from "@/components/roses/parts";

/**
 * Roses, in one place.
 *
 * The currency was administered from six screens: packs on /plans, drop
 * and extend costs on /hearts, the revival price and the media-save split
 * in fairness settings, founding grants on /cities, referral and mission
 * rewards elsewhere again. Each of those screens owned a different half
 * of the same decision — how many roses exist, and what they buy — and
 * nobody could see the tank while turning a tap.
 *
 * The rose fields **moved** here; they were not copied. A setting
 * editable in two places is a setting with two answers.
 *
 * There were seven tabs, and all seven read one /api/roses response —
 * so they were never saving a request, only hiding data already
 * fetched. Worse, they split things that are only meaningful against
 * each other: Packs said what is for sale and Purchases said what
 * actually sold, two tabs apart. Overview was a summary of Earning and
 * Spending, which made it a third place to look at the same numbers.
 *
 * Three now, by the question being asked:
 *
 *   Money    — what is sold, and what sold. Packs plus purchases.
 *   Supply   — how roses enter and leave, and the summary of both.
 *   Records  — what happened to one person's roses. Ledger plus grants,
 *              which belong together because granting some is followed
 *              immediately by checking the ledger to see it worked.
 */

type Tab = "money" | "supply" | "records";

const TABS: { value: Tab; label: string }[] = [
  { value: "money", label: "Money" },
  { value: "supply", label: "Supply" },
  { value: "records", label: "Records" },
];

/*
 * Where the old tab names land now.
 *
 * Five of them are linked from the command palette and from anything
 * anybody bookmarked. Dropping them would turn those into a silent
 * fallback to the first tab, which looks like the link is broken.
 */
const MOVED: Record<string, Tab> = {
  overview: "supply",
  packs: "money",
  purchases: "money",
  earning: "supply",
  spending: "supply",
  ledger: "records",
  grants: "records",
};

const BLURB: Record<Tab, string> = {
  money: "What people can buy with real money, and what they actually bought.",
  supply: "How roses get made, what they are spent on, and the balance of the two.",
  records: "Every rose that has moved, and the controls to move some by hand.",
};

export default function RosesPage() {
  // useSearchParams bails out of prerendering up to the nearest boundary,
  // and a production build fails outright without one.
  return (
    <Suspense fallback={<PageSkeleton sections={3} />}>
      <RosesView />
    </Suspense>
  );
}

function RosesView() {
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<Tab>(() => {
    const asked = searchParams.get("tab") ?? "";
    if (TABS.some((entry) => entry.value === asked)) return asked as Tab;
    // An old link — send it where that content went rather than
    // dropping the reader on the first tab with no explanation.
    return MOVED[asked] ?? "supply";
  });

  const [data, setData] = useState<RosePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<RosePayload>("/api/roses");

    if (error) setError(error);
    else setData(data ?? null);

    setLoading(false);
  }, []);

  useLoadOnMount(load);

  /*
   * One writer for every number on the page.
   *
   * The body says which field and, where the table has more than one row,
   * which row — the route holds the map from field to table and the
   * bounds, so a panel cannot write somewhere it should not.
   */
  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);

      const { error } = await adminFetch("/api/roses", {
        method: "PATCH",
        body: JSON.stringify(body),
      });

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  const panel = () => {
    if (!data) return null;

    const props = { data, patch, busy };

    /*
     * Order within each tab is the order the question gets asked.
     *
     * Money puts what is for sale above what sold, because a price is
     * read against its takings. Supply leads with the summary and then
     * shows the two halves it summarises. Records puts the ledger
     * first — it is what you came to look at; granting is the rarer
     * thing you do while here.
     */
    switch (tab) {
      case "money":
        return (
          <div className="space-y-10">
            <RosePacks {...props} />
            <RosePurchases {...props} />
          </div>
        );
      case "supply":
        return (
          <div className="space-y-10">
            <RoseOverview {...props} />
            <RoseEarning {...props} />
            <RoseSpending {...props} />
          </div>
        );
      case "records":
        return (
          <div className="space-y-10">
            <RoseLedger {...props} />
            <RoseGrants {...props} reload={load} />
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roses"
        description="The in-app currency, end to end."
        actions={
          <>
            <Segmented value={tab} onChange={setTab} options={TABS} size="sm" />
            <Button
              variant="secondary"
              size="icon"
              onClick={load}
              disabled={loading || busy}
              aria-label="Refresh"
            >
              <RefreshCw className={loading ? "animate-spin" : undefined} />
            </Button>
          </>
        }
      />

      <Explainer>{BLURB[tab]}</Explainer>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-card px-4 py-3 text-[0.92rem] text-destructive">
          {error}
        </div>
      )}

      {loading && !data ? <PageSkeleton sections={3} /> : panel()}
    </div>
  );
}
