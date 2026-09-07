"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Section, SettingList, SettingRow } from "@/components/ui/page";
import { PagedList } from "@/components/ui/paged-list";
import { adminFetch, adminTable } from "@/lib/adminFetch";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import {
  Chip,
  NumberField,
  count,
  formatDate,
  money,
  type PanelProps,
} from "@/components/roses/parts";

/**
 * The panels that decide how many roses exist.
 *
 * What a pack costs, what is given away for signing up, referring
 * somebody or finishing a mission, and what an admin hands over by hand.
 * Every one of these is a tap into the same tank, which is the argument
 * for them being on one screen rather than five.
 */

export function RosePacks({ data, patch, busy }: PanelProps) {
  return (
    <div className="space-y-6">
      <Section title="Packs" hint="What somebody can buy, and for how much.">
        {data.packs.length === 0 ? (
          <p className="py-3 text-[0.92rem] text-muted-foreground">
            No packs yet.
          </p>
        ) : (
          <PagedList items={data.packs} perPage={10} className="space-y-3">
            {(pack) => (
              <div
                key={pack.id}
                className="rounded-2xl border border-foreground/[0.06] bg-card p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[0.95rem] font-medium">
                      {pack.label}
                      {!pack.product_id && (
                        <span className="ml-2 text-[0.8rem] font-normal text-muted-foreground">
                          not wired to a store product
                        </span>
                      )}
                    </p>
                    <p className="text-[0.86rem] text-muted-foreground">
                      {count(pack.amount + pack.bonus)} roses for{" "}
                      {money(pack.price_minor, pack.currency)}
                      {pack.bonus > 0 && ` — ${count(pack.bonus)} of them free`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Chip tone={pack.active ? "on" : "off"}>
                      {pack.active ? "On sale" : "Retired"}
                    </Chip>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        patch({
                          table: "rose_packs",
                          id: pack.id,
                          active: !pack.active,
                        })
                      }
                    >
                      {pack.active ? "Retire" : "Restore"}
                    </Button>
                  </div>
                </div>

                <SettingList className="mt-3">
                  <SettingRow
                    label="Roses"
                    control={
                      <NumberField
                        value={pack.amount}
                        disabled={busy}
                        onCommit={(value) =>
                          patch({ field: "amount", value, id: pack.id })
                        }
                      />
                    }
                  />
                  <SettingRow
                    label="Bonus on top"
                    hint="Shown separately so “+20 free” can be said out loud."
                    control={
                      <NumberField
                        value={pack.bonus}
                        disabled={busy}
                        onCommit={(value) =>
                          patch({ field: "bonus", value, id: pack.id })
                        }
                      />
                    }
                  />
                  <SettingRow
                    label="Extra for Premium members"
                    control={
                      <NumberField
                        value={pack.premium_bonus}
                        disabled={busy}
                        onCommit={(value) =>
                          patch({ field: "premium_bonus", value, id: pack.id })
                        }
                      />
                    }
                  />
                  <SettingRow
                    label="Price"
                    hint="In paise. 9900 is ₹99."
                    control={
                      <NumberField
                        value={pack.price_minor}
                        disabled={busy}
                        className="w-32"
                        suffix={money(pack.price_minor, pack.currency)}
                        onCommit={(value) =>
                          patch({ field: "price_minor", value, id: pack.id })
                        }
                      />
                    }
                  />
                </SettingList>
              </div>
            )}
          </PagedList>
        )}
      </Section>

      <Section
        title="Promotions"
        hint="Changes what a pack gives, without changing the pack."
      >
        {data.promotions.length === 0 ? (
          <p className="py-3 text-[0.92rem] text-muted-foreground">
            No promotions have been created.
          </p>
        ) : (
          <PagedList items={data.promotions} variant="settings">
            {(promo) => (
              <SettingRow
                key={promo.id}
                label={promo.label}
                hint={`${promo.kind.replace(/_/g, " ")} · ${promo.value}${
                  promo.kind === "bonus_percent" ? "%" : " roses"
                }${promo.ends_at ? ` · ends ${formatDate(promo.ends_at)}` : ""}`}
                control={
                  <>
                    <Chip tone={promo.active ? "on" : "off"}>
                      {promo.active ? "Running" : "Stopped"}
                    </Chip>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        patch({
                          table: "rose_promotions",
                          id: promo.id,
                          active: !promo.active,
                        })
                      }
                    >
                      {promo.active ? "Stop" : "Start"}
                    </Button>
                  </>
                }
              />
            )}
          </PagedList>
        )}
      </Section>
    </div>
  );
}

export function RoseEarning({ data, patch, busy }: PanelProps) {
  // Only the rose-paying ones. A milestone that hands out Premium days is
  // a real thing and simply not this screen's business.
  const milestones = data.milestones.filter(
    (row) => row.reward_kind === "roses",
  );
  const missions = data.missions.filter((row) => row.reward_kind === "roses");
  const codes = data.codes.filter((row) => row.reward_kind === "roses");

  return (
    <div className="space-y-6">
      <Section
        title="Signing up"
        hint="Given once, when their profile goes live."
      >
        <SettingList>
          {data.plans.map((plan) => (
            <SettingRow
              key={plan.key}
              label={plan.label || plan.key}
              control={
                <NumberField
                  value={plan.signup_roses}
                  disabled={busy}
                  suffix="roses"
                  onCommit={(value) =>
                    patch({ field: "signup_roses", value, key: plan.key })
                  }
                />
              }
            />
          ))}
        </SettingList>
      </Section>

      <Section
        title="Inviting friends"
        hint="Rewards for bringing somebody in, paid in roses."
      >
        {milestones.length === 0 ? (
          <p className="py-3 text-[0.92rem] text-muted-foreground">
            No referral milestone pays roses.
          </p>
        ) : (
          <PagedList items={milestones} variant="settings">
            {(milestone) => (
              <SettingRow
                key={milestone.id}
                label={milestone.label}
                control={
                  <>
                    <NumberField
                      value={milestone.reward_value}
                      disabled={busy}
                      suffix="roses"
                      onCommit={(value) =>
                        patch({
                          field: "reward_value",
                          value,
                          id: milestone.id,
                          table: "referral_milestones",
                        })
                      }
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        patch({
                          table: "referral_milestones",
                          id: milestone.id,
                          active: !milestone.active,
                        })
                      }
                    >
                      {milestone.active ? "Retire" : "Restore"}
                    </Button>
                  </>
                }
              />
            )}
          </PagedList>
        )}
      </Section>

      <Section title="Missions" hint="City missions that pay roses.">
        {missions.length === 0 ? (
          <p className="py-3 text-[0.92rem] text-muted-foreground">
            No mission pays roses.
          </p>
        ) : (
          <PagedList items={missions} variant="settings">
            {(mission) => (
              <SettingRow
                key={mission.id}
                label={mission.label}
                hint={
                  mission.city_slug
                    ? `Only in ${mission.city_slug}`
                    : "Everywhere"
                }
                control={
                  <NumberField
                    value={mission.reward_value}
                    disabled={busy}
                    suffix="roses"
                    onCommit={(value) =>
                      patch({
                        field: "reward_value",
                        value,
                        id: mission.id,
                        table: "city_missions",
                      })
                    }
                  />
                }
              />
            )}
          </PagedList>
        )}
      </Section>

      {/*
        "New cities" sat here — a per-city founding grant, set to 50
        roses on every row. Nothing ever paid it: there is no code that
        reads founding_roses, and the city screen that framed it was a
        launch flow the app never asked about. Removed with that screen
        rather than left as a number somebody could keep tuning.
      */}

      <Section
        title="Codes"
        hint="Made on Plans. Retiring one stops it straight away."
      >
        {codes.length === 0 ? (
          <p className="py-3 text-[0.92rem] text-muted-foreground">
            No promo code pays roses.
          </p>
        ) : (
          <PagedList items={codes} variant="settings">
            {(code) => (
              <SettingRow
                key={code.id}
                label={code.code}
                hint={`${code.label} · ${count(code.reward_value)} roses · used ${count(
                  code.used,
                )}${code.max_uses ? ` of ${count(code.max_uses)}` : ""}${
                  code.city ? ` · ${code.city}` : ""
                }`}
                control={
                  <>
                    <Chip tone={code.active ? "on" : "off"}>
                      {code.active ? "Live" : "Retired"}
                    </Chip>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        patch({
                          table: "promo_codes",
                          id: code.id,
                          active: !code.active,
                        })
                      }
                    >
                      {code.active ? "Retire" : "Restore"}
                    </Button>
                  </>
                }
              />
            )}
          </PagedList>
        )}
      </Section>
    </div>
  );
}

type MemberOption = {
  user_id: string;
  name: string | null;
  email: string | null;
  roses: number;
};

/**
 * Granting roses by hand.
 *
 * The two reasons this exists: a purchase that was charged and never
 * credited, and a support case where somebody lost roses to a bug. Both
 * are made whole here, and both land in the ledger as admin_grant — which
 * is the point of doing it through the RPC rather than an UPDATE.
 */
export function RoseGrants({
  data,
  reload,
}: PanelProps & { reload: () => void }) {
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [chosen, setChosen] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    const { data } = await adminTable<MemberOption>("profiles", {
      select: "user_id, name, email, roses",
      order: "created_at",
      limit: 2000,
    });

    setMembers(data ?? []);
  }, []);

  useLoadOnMount(loadMembers);

  const options = useMemo(
    () =>
      members.map((member) => ({
        value: member.user_id,
        label: member.name || member.email || "Unnamed member",
        hint: `${count(member.roses ?? 0)} roses`,
      })),
    [members],
  );

  const selected = members.find((member) => member.user_id === chosen) ?? null;

  const move = useCallback(
    async (sign: 1 | -1) => {
      setBusy(true);
      setError(null);
      setDone(null);

      const { data: result, error } = await adminFetch<{ balance: number }>(
        "/api/roses",
        {
          method: "POST",
          body: JSON.stringify({
            user_id: chosen,
            amount: sign * Math.abs(Number(amount)),
          }),
        },
      );

      if (error) setError(error);
      else {
        setDone(`Done. They now hold ${count(result?.balance ?? 0)} roses.`);
        setAmount("");
        await loadMembers();
        reload();
      }

      setBusy(false);
    },
    [chosen, amount, loadMembers, reload],
  );

  const ready = chosen && Number(amount) > 0 && !busy;

  // The ledger already carries these; showing them here is what makes the
  // tab answerable to "who has been handing roses out".
  const byHand = data.recent.filter(
    (row) => row.reason === "admin_grant" || row.reason === "admin_deduct",
  );

  return (
    <div className="space-y-6">
      <Section
        title="Grant roses"
        hint="500 at a time at most. Every grant has your name on it."
      >
        <div className="flex flex-wrap items-end gap-2">
          <Combobox
            value={chosen}
            onChange={setChosen}
            options={options}
            placeholder="Find a member…"
            emptyLabel="No member by that name"
            className="w-[20rem]"
          />

          <Input
            type="number"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="roses"
            className="h-9 w-28"
          />

          <Button disabled={!ready} onClick={() => move(1)}>
            Grant
          </Button>

          <Button
            variant="secondary"
            disabled={!ready}
            onClick={() => move(-1)}
          >
            Take back
          </Button>
        </div>

        {selected && (
          <p className="mt-3 text-[0.86rem] text-muted-foreground">
            {selected.name || selected.email || "This member"} currently holds{" "}
            {count(selected.roses ?? 0)} roses.{" "}
            <Link
              href={`/members/${selected.user_id}`}
              className="underline-offset-2 hover:text-foreground hover:underline"
            >
              Open their profile
            </Link>
          </p>
        )}

        {error && (
          <p className="mt-3 text-[0.86rem] text-destructive">{error}</p>
        )}
        {done && (
          <p className="mt-3 text-[0.86rem] text-muted-foreground">{done}</p>
        )}
      </Section>

      <Section title="Recent grants" hint="Out of the last 200 movements.">
        {byHand.length === 0 ? (
          <p className="py-3 text-[0.92rem] text-muted-foreground">
            No admin has moved roses by hand.
          </p>
        ) : (
          <PagedList items={byHand} variant="settings">
            {(row) => (
              <SettingRow
                key={row.id}
                label={row.name}
                hint={formatDate(row.created_at)}
                control={
                  <>
                    <span className="tnum">
                      {row.amount > 0
                        ? `+${count(row.amount)}`
                        : count(row.amount)}
                    </span>
                    <Chip>{count(row.balance_after)} after</Chip>
                  </>
                }
              />
            )}
          </PagedList>
        )}
      </Section>
    </div>
  );
}
