"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { adminTable } from "@/lib/adminFetch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, Trash2, UserPlus } from "lucide-react";
import { ConfigHistory } from "@/components/ConfigHistory";
import { PageSkeleton } from "@/components/ui/page";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { useConfirm } from "@/components/ui/confirm";
import { PageHeader, Explainer } from "@/components/ui/page";
import { Segmented } from "@/components/ui/select";
import { RolesPanel } from "@/components/access/RolesPanel";
import {
  Pagination,
  paginate,
  usePagination,
} from "@/components/ui/pagination";

type AdminProfile = {
  id: string;
  email: string;
  role: "admin";
  /*
   * Which role they hold, which the table never showed.
   *
   * It listed Created and Updated instead — two timestamps nobody
   * decides anything from — while the one fact you open this screen to
   * check, whether somebody is a super admin, was not on it at all.
   */
  role_key: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type FormState = {
  email: string;
  display_name: string;
};

const emptyForm: FormState = {
  email: "",
  display_name: "",
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
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

function getInitials(nameOrEmail: string) {
  const source = nameOrEmail.trim() || "AD";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function AccessPage() {
  // useSearchParams bails out of prerendering up to the nearest boundary, and
  // a production build fails outright without one.
  return (
    <Suspense fallback={<PageSkeleton sections={2} />}>
      <AccessView />
    </Suspense>
  );
}

type Tab = "people" | "roles" | "history";

const TABS: { value: Tab; label: string }[] = [
  { value: "people", label: "People" },
  { value: "roles", label: "What they can do" },
  { value: "history", label: "What changed" },
];

/** One line per tab, so landing on one you did not pick still explains itself. */
const BLURB: Record<Tab, string> = {
  people:
    "Everybody who can sign into this panel. Adding somebody emails them an invitation; removing somebody takes their access away at once and leaves their member account alone.",
  roles:
    "What each role is allowed to do. Change a role and it changes for everybody who holds it.",
  history: "Every change made in this panel, by whom, and when.",
};

function AccessView() {
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const asked = searchParams.get("tab");
    return asked === "roles" || asked === "history" ? asked : "people";
  });

  // The palette links here as /access?new=1, which should land with the
  // cursor in the box rather than merely on the right page.
  const compose = searchParams.get("new") === "1";
  useEffect(() => {
    if (compose) document.getElementById("admin-email")?.focus();
  }, [compose]);

  const supabase = useMemo(() => createClient(), []);
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Clamps itself when the list shortens, so removing the last admin on
  // page two does not strand you on an empty one.
  const { page, setPage } = usePagination(profiles.length);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadAdmins = useCallback(async () => {
    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    setCurrentUserId(user?.id ?? null);

    // Through the panel's route: RLS on admin_profiles scopes reads to your
    // own row, which is exactly what AuthGuard needs and exactly wrong for a
    // page whose job is listing everyone else.
    const { data, error } = await adminTable<AdminProfile>("admin_profiles", {
      select:
        "id, email, role, role_key, display_name, avatar_url, created_at, updated_at",
      eq: ["role", "admin"],
      order: "updated_at",
    });

    if (error) {
      setError(error);
      setProfiles([]);
    } else {
      setProfiles(data ?? []);
    }

    setLoading(false);
  }, [supabase]);

  useLoadOnMount(loadAdmins);

  const handleReset = () => {
    setForm(emptyForm);
    setSuccess(null);
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    if (!form.email.trim() || !form.display_name.trim()) {
      setError("Email and display name are required.");
      setSaving(false);
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setError("Your session expired. Sign in again.");
      setSaving(false);
      return;
    }

    const response = await fetch("/api/admins", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: form.email.trim(),
        display_name: form.display_name.trim(),
      }),
    });

    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(result.error ?? "Failed to create admin.");
    } else {
      setSuccess("Admin created.");
      setForm(emptyForm);
      await loadAdmins();
    }

    setSaving(false);
  };

  const handleDelete = async (profile: AdminProfile) => {
    if (profile.id === currentUserId) {
      setError("You cannot delete your own admin access from this page.");
      setSuccess(null);
      return;
    }

    const confirmed = await confirm({
      title: `Remove admin access for ${profile.email}?`,
      body: "They lose access to this panel immediately. Their member account is untouched.",
      confirmLabel: "Remove access",
      tone: "danger",
    });
    if (!confirmed) return;

    setDeletingId(profile.id);
    setError(null);
    setSuccess(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setError("Your session expired. Sign in again.");
      setDeletingId(null);
      return;
    }

    const response = await fetch(
      `/api/admins?id=${encodeURIComponent(profile.id)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      },
    );
    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(result.error ?? "Failed to delete admin.");
    } else {
      setSuccess("Admin deleted.");
      await loadAdmins();
    }

    setDeletingId(null);
  };

  return (
    <div className="w-full space-y-8">
      <PageHeader
        title="Access"
        description="Who can sign in here, and what they can change."
        actions={
          <>
            <Segmented value={tab} onChange={setTab} options={TABS} />
            {tab === "people" && (
              <Button
                variant="secondary"
                onClick={loadAdmins}
                disabled={loading}
              >
                <RefreshCw className={loading ? "animate-spin" : undefined} />
                Refresh
              </Button>
            )}
          </>
        }
      />

      <Explainer>{BLURB[tab]}</Explainer>

      {tab === "roles" && <RolesPanel />}

      {tab === "history" && <ConfigHistory />}

      {tab === "people" && (
        <>
          {/*
            The two stat cards are gone.

            They gave a quarter of the screen to "Admins: 2" and a
            timestamp — a number you can count by looking at the list
            directly beneath it, and a date nobody decides anything
            from. The count now sits in the sentence above the table,
            where it costs a word instead of a card.
          */}
          <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
            <Card className="border-foreground/[0.06] bg-card">
              <CardHeader>
                <CardTitle>Add an admin</CardTitle>
                <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
                  They get an email invitation.
                </p>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <Label htmlFor="admin-email">Email</Label>
                    <Input
                      id="admin-email"
                      type="email"
                      value={form.email}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }

                      placeholder="admin@tickle.app"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="admin-name">Display Name</Label>
                    <Input
                      id="admin-name"
                      value={form.display_name}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          display_name: event.target.value,
                        }))
                      }

                      placeholder="System Admin"
                      required
                    />
                  </div>

                  {error && (
                    <p className="text-[0.92rem] text-destructive">{error}</p>
                  )}
                  {success && (
                    <p className="text-[0.92rem] text-foreground">{success}</p>
                  )}

                  <div className="flex gap-3">
                    <Button
                      type="submit"
                      className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                      disabled={saving}
                    >
                      <UserPlus className="mr-2 size-4" />
                      {saving ? "Creating..." : "Create Admin"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-foreground/[0.06]"
                      onClick={handleReset}
                    >
                      Reset
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <div className="rounded-lg border border-foreground/[0.06] bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="border-foreground/[0.06] hover:bg-transparent">
                    {/* Created and Updated were two of five columns and
                        nobody acts on either. What they can do is the
                        reason to look at this list. */}
                    <TableHead>Admin</TableHead>
                    <TableHead>What they can do</TableHead>
                    <TableHead>Added</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="h-24 text-center text-muted-foreground"
                      >
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : profiles.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="h-24 text-center text-muted-foreground"
                      >
                        No admins found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginate(profiles, page).map((profile) => {
                      const name = profile.display_name || profile.email;
                      const initials = getInitials(name);
                      const isCurrentUser = profile.id === currentUserId;

                      return (
                        <TableRow
                          key={profile.id}
                          className="border-foreground/[0.06]"
                        >
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-10 w-10 rounded-lg border border-foreground/[0.06]">
                                <AvatarImage src={profile.avatar_url || ""} />
                                <AvatarFallback className="rounded-lg bg-transparent text-muted-foreground">
                                  {initials}
                                </AvatarFallback>
                              </Avatar>
                              <div className="space-y-1">
                                <div className="font-medium">{name}</div>
                                <div className="font-mono text-[0.86rem] text-muted-foreground">
                                  {profile.email}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {/*
                                A missing role_key is not "no access" —
                                it is an older row that predates roles
                                and still holds full admin. Saying
                                "everything" is the honest reading.
                              */}
                              <Badge
                                variant={
                                  profile.role_key === "super"
                                    ? "default"
                                    : "secondary"
                                }
                              >
                                {profile.role_key === "super"
                                  ? "Everything, including admins"
                                  : profile.role_key
                                    ? profile.role_key
                                    : "Everything"}
                              </Badge>

                              {isCurrentUser && (
                                <span className="text-[0.8rem] text-muted-foreground">
                                  you
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-[0.86rem] text-muted-foreground">
                            {formatDateTime(profile.created_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(profile)}
                              className="text-[0.8rem]"
                              disabled={
                                deletingId === profile.id || isCurrentUser
                              }
                            >
                              <Trash2 className="mr-2 size-4" />
                              {deletingId === profile.id
                                ? "Deleting..."
                                : "Delete"}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>

              <div className="px-4 pb-3">
                <Pagination
                  page={page}
                  total={profiles.length}
                  onPage={setPage}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
