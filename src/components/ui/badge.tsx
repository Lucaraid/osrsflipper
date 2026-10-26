import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "bg-surface-3 text-muted",
      pos: "bg-pos-soft text-pos",
      neg: "bg-neg-soft text-neg",
      warn: "bg-warn-soft text-warn",
      accent: "bg-accent-soft text-accent",
      info: "bg-info-soft text-info",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
