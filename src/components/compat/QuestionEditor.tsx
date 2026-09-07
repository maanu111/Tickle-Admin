"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Plus, Trash2, X } from "lucide-react";
import { useModalLock } from "@/lib/useModalLock";

/**
 * Writing a matching question.
 *
 * The thirty that exist were seeded in a migration, so adding one meant
 * writing SQL and deploying — which is the wrong bar for a question you
 * want to try for a month and drop. Editing the wording was not possible
 * at all, and bad wording is the most common reason a question goes
 * unanswered: the only remedy available was to switch it off.
 *
 * Two things are deliberately not editable once a question exists. The
 * key, because every answer row points at it. And the kind, because a
 * scale answer is "1".."5" and a choice answer is the option's text —
 * switching between them would leave every existing answer unreadable.
 */

export type Question = {
  key: string;
  label: string;
  question: string;
  kind: string;
  section: string;
  options: string[] | null;
  sort: number;
  quick_start: boolean;
  active: boolean;
  answered: number;
};

const KINDS: { value: string; label: string; hint: string }[] = [
  {
    value: "choice",
    label: "Pick one",
    hint: "They choose a single answer from your list.",
  },
  {
    value: "multi",
    label: "Pick several",
    hint: "They can choose more than one.",
  },
  {
    value: "scale",
    label: "A sliding scale",
    hint: "Five steps between two extremes, like Very slowly to Very fast.",
  },
];

export function QuestionEditor({
  question,
  sections,
  busy,
  onSave,
  onCancel,
}: {
  /** Null when writing a new one. */
  question: Question | null;
  sections: string[];
  busy: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const editing = question !== null;

  useModalLock(true);

  const [label, setLabel] = useState(question?.label ?? "");
  const [text, setText] = useState(question?.question ?? "");
  const [kind, setKind] = useState(question?.kind ?? "choice");
  const [section, setSection] = useState(question?.section ?? sections[0] ?? "");
  const [quickStart, setQuickStart] = useState(question?.quick_start ?? false);

  /*
   * A scale is always five steps and only the ends are labelled, which is
   * how the seeded ones are stored: ["Very slowly", "", "", "", "Very fast"].
   * Keeping that shape here means the editor writes rows the app can
   * already render.
   */
  const [options, setOptions] = useState<string[]>(() => {
    if (question?.options?.length) return question.options;
    return kind === "scale" ? ["", "", "", "", ""] : ["", ""];
  });

  const [low, setLow] = useState(question?.options?.[0] ?? "");
  const [high, setHigh] = useState(question?.options?.[4] ?? "");

  const scale = kind === "scale";

  const cleanOptions = scale
    ? [low.trim(), "", "", "", high.trim()]
    : options.map((option) => option.trim()).filter(Boolean);

  const ready =
    label.trim().length >= 2 &&
    text.trim().length >= 4 &&
    section.trim().length > 0 &&
    (scale
      ? low.trim().length > 0 && high.trim().length > 0
      : cleanOptions.length >= 2 &&
        new Set(cleanOptions).size === cleanOptions.length);

  /*
   * Whether this edit can break existing answers.
   *
   * An answer is stored as the option's text. Remove or rename one and
   * everybody who picked it is holding a value the question no longer
   * offers — they score as if they never answered. Adding is safe.
   */
  const removedOptions =
    editing && question.options
      ? question.options.filter(
          (option) => option.trim() && !cleanOptions.includes(option),
        )
      : [];

  const breaking = removedOptions.length > 0 && question!.answered > 0;

  const submit = async () => {
    await onSave({
      ...(editing ? { key: question.key } : { kind }),
      label: label.trim(),
      question: text.trim(),
      section: section.trim(),
      quick_start: quickStart,
      ...(scale || cleanOptions.length >= 2 ? { options: cleanOptions } : {}),
    });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-foreground/[0.12] p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        onClick={(event) => event.stopPropagation()}
        className="surface-float flex max-h-[86vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-foreground/[0.06] p-5">
          <div>
            <h2 className="text-[1.05rem] font-bold">
              {editing ? "Edit this question" : "A new question"}
            </h2>
            {editing && question.answered > 0 && (
              <p className="text-[0.86rem] text-muted-foreground">
                {question.answered}{" "}
                {question.answered === 1 ? "person has" : "people have"} answered it.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Cancel"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <Field
            id="q-text"
            label="What members are asked"
            hint="Written the way you would say it out loud."
          >
            <Input
              id="q-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="How often do you like to be in touch?"
            />
          </Field>

          <Field
            id="q-label"
            label="Short name"
            hint="How it appears in this table. Members never see it."
          >
            <Input
              id="q-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Contact frequency"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="block text-[0.86rem] font-medium">Group</span>
              <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
                Which part of the questionnaire.
              </p>
              <Select
                value={section}
                onChange={setSection}
                options={sections.map((entry) => ({ value: entry, label: entry }))}
              />
            </div>

            <div>
              <span className="block text-[0.86rem] font-medium">How they answer</span>
              <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
                {editing
                  ? "Fixed once people have answered."
                  : KINDS.find((entry) => entry.value === kind)?.hint}
              </p>
              <Select
                value={kind}
                onChange={(next) => {
                  setKind(next);
                  setOptions(next === "scale" ? ["", "", "", "", ""] : ["", ""]);
                }}
                options={KINDS.map((entry) => ({
                  value: entry.value,
                  label: entry.label,
                }))}
                disabled={editing}
              />
            </div>
          </div>

          {scale ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="q-low" label="One end" hint="The 1 on the slider.">
                <Input
                  id="q-low"
                  value={low}
                  onChange={(event) => setLow(event.target.value)}
                  placeholder="Very slowly"
                />
              </Field>
              <Field id="q-high" label="The other end" hint="The 5.">
                <Input
                  id="q-high"
                  value={high}
                  onChange={(event) => setHigh(event.target.value)}
                  placeholder="Very fast"
                />
              </Field>
            </div>
          ) : (
            <div>
              <span className="block text-[0.86rem] font-medium">The answers</span>
              <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
                At least two. These are what members pick between.
              </p>

              <div className="space-y-2">
                {options.map((option, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      value={option}
                      onChange={(event) =>
                        setOptions((current) =>
                          current.map((entry, position) =>
                            position === index ? event.target.value : entry,
                          ),
                        )
                      }
                      placeholder={`Answer ${index + 1}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={options.length <= 2}
                      aria-label={`Remove answer ${index + 1}`}
                      onClick={() =>
                        setOptions((current) =>
                          current.filter((_, position) => position !== index),
                        )
                      }
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                onClick={() => setOptions((current) => [...current, ""])}
                className="mt-2 h-9 text-[0.86rem]"
              >
                <Plus className="mr-1.5 size-3.5" />
                Another answer
              </Button>
            </div>
          )}

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-foreground/[0.06] p-3">
            <input
              type="checkbox"
              checked={quickStart}
              onChange={(event) => setQuickStart(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-[0.86rem] font-medium">Ask it at signup</span>
              <span className="block text-[0.8rem] leading-relaxed text-muted-foreground">
                Off means it waits in the longer set people fill in later. Asking
                everything at signup is the fastest way to have nobody finish.
              </span>
            </span>
          </label>

          {/*
            The one warning that matters here.

            Removing an option does not just change the question — it
            strands everyone who picked that answer, and they start
            scoring as though they had never answered at all.
          */}
          {breaking && (
            <p className="rounded-xl border border-warning/30 bg-warning/[0.06] p-3 text-[0.86rem] leading-relaxed text-warning">
              You removed {removedOptions.map((option) => `"${option}"`).join(", ")}.
              Anyone who picked that keeps an answer this question no longer offers,
              and will score as if they never answered it.
            </p>
          )}
        </div>

        <div className="flex gap-2 border-t border-foreground/[0.06] p-5">
          <Button onClick={submit} disabled={busy || !ready} className="h-9 text-[0.86rem]">
            {busy ? "Saving" : editing ? "Save changes" : "Add the question"}
          </Button>
          <Button variant="ghost" onClick={onCancel} className="h-9 text-[0.86rem]">
            Cancel
          </Button>
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[0.86rem] font-medium">
        {label}
      </label>
      <p className="mb-1.5 text-[0.8rem] leading-relaxed text-muted-foreground">{hint}</p>
      {children}
    </div>
  );
}
