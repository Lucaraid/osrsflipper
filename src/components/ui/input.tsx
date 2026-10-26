"use client";
import * as React from "react";
import { cn, parseAmount } from "@/lib/utils";

export const inputClass =
  "h-8 w-full rounded-md border border-border bg-surface-2 px-2.5 text-sm text-text placeholder:text-faint focus:border-accent focus:outline-none disabled:opacity-60";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(inputClass, className)} {...props} />
));
Input.displayName = "Input";

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1 block text-xs font-medium text-muted", className)} {...props} />;
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-faint">{hint}</p>}
    </div>
  );
}

/**
 * Zahleneingabe mit OSRS-Kurzschreibweise (k/m/b). Hält den Rohtext lokal,
 * meldet den geparsten Wert (oder null) an den Parent.
 */
export function AmountInput({
  value,
  onChange,
  allowEmpty = true,
  className,
  ...rest
}: { value: number | null; onChange: (v: number | null) => void; allowEmpty?: boolean } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [text, setText] = React.useState(fmtAmount(value));
  const [prev, setPrev] = React.useState(value);
  // Externe Wertänderung → Anzeige synchronisieren (Muster "state from props" ohne Effect)
  if (value !== prev) {
    setPrev(value);
    if (value !== parseAmount(text)) setText(fmtAmount(value));
  }
  const parsed = parseAmount(text);
  const invalid = text.trim() !== "" && parsed == null;
  return (
    <input
      inputMode="decimal"
      className={cn(inputClass, "num", invalid && "border-neg", className)}
      value={text}
      aria-invalid={invalid || undefined}
      onChange={(e) => {
        setText(e.target.value);
        const v = parseAmount(e.target.value);
        if (v != null || (allowEmpty && e.target.value.trim() === "")) {
          setPrev(v);
          onChange(v);
        }
      }}
      {...rest}
    />
  );
}

function fmtAmount(v: number | null): string {
  return v == null ? "" : new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 }).format(v);
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(inputClass, "pr-7", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputClass, "h-auto min-h-16 py-1.5", className)} {...props} />;
}
