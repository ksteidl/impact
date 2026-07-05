import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
  {
    variants: {
      variant: {
        neutral: "border-ink/15 bg-white text-ink/70",
        moss: "border-moss-600/25 bg-moss-50 text-moss-700",
        amber: "border-amber-700/25 bg-amber-50 text-amber-700",
        clay: "border-clay-700/25 bg-clay-50 text-clay-700",
        mono: "border-ink/15 bg-ink/[0.04] font-mono text-ink/80",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
