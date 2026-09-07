"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * A select that matches the rest of the system.
 *
 * The native <select> cannot be styled where it matters — the option
 * list is drawn by the operating system, so it arrives in the OS font
 * at the OS size with square corners, which on this panel looks like a
 * different application opening on top of it.
 *
 * Alignment was the specific complaint, so the menu is positioned
 * against the trigger's own box: same left edge, same width, 6px below.
 * A menu that is merely near its trigger reads as unanchored.
 */

export type SelectOption = {
  value: string;
  label: string;
  hint?: string;
};

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled,
  className,
  align = "start",
}: {
  value: string | null;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  align?: "start" | "end";
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [box, setBox] = React.useState<DOMRect | null>(null);

  /*
   * The menu is portalled to <body>, so it needs the trigger's position
   * in viewport coordinates rather than inheriting it from a parent.
   *
   * Measured on open and again on scroll or resize: the menu is
   * position:fixed, so anything that moves the trigger under it leaves
   * the two detached otherwise.
   */
  React.useLayoutEffect(() => {
    if (!open) return;

    const measure = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) setBox(rect);
    };

    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  const selected = options.find((option) => option.value === value) ?? null;

  // Close on an outside click or on Escape. Both, not either: a menu
  // that only closes on click traps keyboard users, and one that only
  // closes on Escape stays open behind whatever is clicked next.
  React.useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      /*
       * The menu is portalled, so it is no longer inside rootRef — and
       * pointerdown fires before click. Without checking the menu too,
       * pressing an option counted as clicking outside, unmounted the
       * menu, and the click never reached the option: the dropdown
       * looked like it simply refused to select anything.
       */
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-foreground/30 bg-card/70 px-3 text-[0.92rem] transition-all outline-none",
          "hover:border-foreground/45 hover:bg-card",
          "focus-visible:border-foreground/60 focus-visible:ring-3 focus-visible:ring-ring/15",
          open && "border-foreground/60 bg-card",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        <span
          className={cn(
            "truncate",
            !selected && "text-muted-foreground/70"
          )}
        >
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {/*
        Portalled to <body>, not rendered in place.
        
        An absolutely positioned menu is still clipped by any ancestor
        with overflow-hidden — which every Card here has, to keep its
        rounded corners. On /venues that cut the options list in half.
        A portal escapes the clip entirely; z-index alone cannot.
      */}
      {open && box && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          style={{
            position: "fixed",
            top: box.bottom + 6,
            left: align === "end" ? undefined : box.left,
            right: align === "end" ? window.innerWidth - box.right : undefined,
            minWidth: box.width,
            // Never taller than the room below the trigger, so the list
            // scrolls internally instead of running off the screen.
            maxHeight: Math.max(160, window.innerHeight - box.bottom - 24),
          }}
          /*
           * Above the modals, deliberately.
           *
           * This was z-[200] while every wizard and confirm dialog is
           * z-[300]. Both portal to <body>, so they are siblings and
           * z-index alone decides — which meant a dropdown opened inside
           * a wizard rendered behind it. The trigger showed the current
           * value, the menu was there in the DOM, and nothing appeared:
           * it read as a dropdown with only one option.
           *
           * A menu always belongs above the surface that owns it, so
           * this sits above the modal layer rather than beside it.
           */
          className="animate-toast-in surface-float z-[400] overflow-auto rounded-xl p-1"
        >
          {options.map((option) => {
            const active = option.value === value;

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[0.92rem] transition-colors",
                  active
                    ? "bg-foreground/[0.06] font-medium"
                    : "hover:bg-foreground/[0.04]"
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{option.label}</span>
                  {option.hint && (
                    <span className="block truncate text-[1rem] text-muted-foreground">
                      {option.hint}
                    </span>
                  )}
                </span>

                {/* The tick occupies its row whether or not it is shown,
                    so labels do not shift sideways as the selection
                    moves down the list. */}
                <Check
                  className={cn(
                    "size-3 shrink-0",
                    active ? "opacity-100" : "opacity-0"
                  )}
                />
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}

/**
 * The segmented control from the reference — a pill group with the
 * active item filled near-black.
 *
 * It appears three times in the reference (top nav, chart range, feed
 * filter) with identical treatment, which is what makes it read as one
 * idea rather than three controls.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "default",
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  className?: string;
  size?: "default" | "sm";
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full bg-foreground/[0.05] p-0.5",
        className
      )}
    >
      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-full font-medium transition-all duration-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
              size === "sm"
                ? "px-2.5 py-1 text-[1rem]"
                : "px-3.5 py-1.5 text-[1rem]",
              active
                ? "bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(26,26,24,0.18)]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
