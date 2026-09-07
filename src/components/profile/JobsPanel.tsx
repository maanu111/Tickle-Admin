"use client";
import { useCallback, useMemo, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, RefreshCw, Search } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Pagination, paginate, usePagination } from "@/components/ui/pagination";
import { useLoadOnMount } from "@/lib/useLoadOnMount";

/**
 * The profession list behind"What do you do?".
 *
 * Live: what is edited here is what the picker offers on the next search,
 * with no build in between. That is the point of the table existing.
 *
 * Retiring hides a profession from the picker and leaves it on every
 * profile that already chose it — so this page never silently rewrites
 * someone's answer.
 */

type Profession = {
  id: string;
  name: string;
  category: string;
  synonyms: string[];
  popularity: number;
  active: boolean;
};

type Payload = {
  professions: Profession[];
  categories: string[];
  activeCount: number;
  retiredCount: number;
};

export function JobsPanel() {
  const [rows, setRows] = useState<Profession[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("Other");
  const [newSynonyms, setNewSynonyms] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<Payload>("/api/professions");

    if (error) {
      setError(error);
    } else {
      setRows(data?.professions ?? []);
      setCategories(data?.categories ?? []);
    }

    setLoading(false);
  }, []);

  useLoadOnMount(load);

  const add = useCallback(async () => {
    const name = newName.trim();
    if (name.length < 2) return;

    setBusy("new");

    const { data, error } = await adminFetch<{ profession: Profession }>("/api/professions", {
      method: "POST",
      body: JSON.stringify({
        name,
        category: newCategory,
        // Comma-separated in the box, an array in the column. Synonyms are
        // what someone types instead of the name —"SDE", "CA", "govt".
        synonyms: newSynonyms
          .split(", ")
          .map((entry) => entry.trim())
          .filter(Boolean),
        popularity: 0,
      }),
    });

    if (error) {
      setError(error);
    } else if (data?.profession) {
      setRows((current) => [...current, data.profession]);
      setNewName("");
      setNewSynonyms("");
    }

    setBusy(null);
  }, [newName, newCategory, newSynonyms]);

  const patch = useCallback(async (row: Profession, update: Partial<Profession>) => {
    setBusy(row.id);

    const { data, error } = await adminFetch<{ profession: Profession }>("/api/professions", {
      method: "PATCH",
      body: JSON.stringify({ id: row.id, ...update }),
    });

    if (error) {
      setError(error);
    } else if (data?.profession) {
      setRows((current) => current.map((entry) => (entry.id === row.id ? data.profession : entry)));
    }

    setBusy(null);
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (category !== "all" && row.category !== category) return false;
      if (!q) return true;

      return (
        row.name.toLowerCase().includes(q) ||
        row.synonyms.some((entry) => entry.includes(q))
      );
    });
  }, [rows, category, query]);

  const activeCount = rows.filter((row) => row.active).length;

  // Resets when a filter shortens the list, so filtering while on a
  // later page cannot leave you looking at an empty one.
  const { page, setPage } = usePagination(visible.length);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-[0.86rem] text-muted-foreground">
          {activeCount} in use · {rows.length - activeCount} retired
        </p>

        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name or synonym"
              className="pl-8"
            />
          </div>
          <Button variant="outline" size="icon" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" :"h-4 w-4"} />
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-[0.92rem] text-destructive">{error}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a profession</CardTitle>
          <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
            Retiring one later keeps it on profiles that already use it.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Name, as it should appear"
            className="sm:flex-1"
          />
          <Select
            value={newCategory}
            onChange={(next) => setNewCategory(next as never)}
            options={categories.map((entry) => ({
              value: String(entry),
              label: String(entry),
            }))}
            className="w-[11rem]"
          />
          <Input
            value={newSynonyms}
            onChange={(event) => setNewSynonyms(event.target.value)}
            placeholder="Synonyms, comma separated"
            className="sm:flex-1"
          />
          <Button onClick={add} disabled={busy === "new" || newName.trim().length < 2}>
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {["all", ...categories].map((entry) => (
          <Button
            key={entry}
            variant={category === entry ? "default" :"outline"}
            size="sm"
            onClick={() => setCategory(entry)}
          >
            {entry === "all" ? "All" : entry}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-[0.92rem]">
            <thead className="border-b bg-foreground/[0.03]">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Also found by</th>
                <th className="px-4 py-3 font-medium">Rank</th>
                <th className="px-4 py-3 font-medium text-right">In picker</th>
              </tr>
            </thead>
            <tbody>
              <>
                {paginate(visible, page).map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">
                    <span className={row.active ? "" :"text-muted-foreground line-through"}>
                      {row.name}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">{row.category}</Badge>
                  </td>
                  <td className="max-w-xs px-4 py-3 text-muted-foreground">
                    {row.synonyms.join(", ") ||"—"}
                  </td>
                  <td className="px-4 py-3">
                    {/* Ties in the search are broken by this, so it is the
                        lever for pushing a common job to the top. */}
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={row.popularity}
                      onBlur={(event) => {
                        const value = Number(event.target.value);
                        if (value !== row.popularity) patch(row, { popularity: value });
                      }}
                      className="h-8 w-20"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant={row.active ? "outline" :"default"}
                      size="sm"
                      disabled={busy === row.id}
                      onClick={() => patch(row, { active: !row.active })}
                    >
                      {row.active ? "Retire" :"Restore"}
                    </Button>
                  </td>
                </tr>
              ))}
              </>

              {!loading && visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    Nothing matches that search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Outside the table, not inside <tbody>.
              Pagination renders a <div>, and a div is not valid inside a
              tbody — the browser hoists it out of the table during parse,
              so the server HTML and the client tree disagree and React
              reports a hydration error. */}
          <div className="px-4 pb-3">
            <Pagination page={page} total={visible.length} onPage={setPage} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
