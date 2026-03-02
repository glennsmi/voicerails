import * as React from "react";
import {cva, type VariantProps} from "class-variance-authority";
import {cn} from "../../lib/utils.js";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em]",
  {
    variants: {
      variant: {
        default: "border-[var(--border-bright)] text-[var(--text-secondary)]",
        accent: "border-[var(--accent)]/50 bg-[var(--accent-glow)] text-[var(--accent)]",
        blue: "border-blue-400/40 bg-blue-500/10 text-blue-300",
        pink: "border-pink-400/40 bg-pink-500/10 text-pink-300",
        orange: "border-orange-400/40 bg-orange-500/10 text-orange-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({className, variant, ...props}: BadgeProps) {
  return <div className={cn(badgeVariants({variant}), className)} {...props} />;
}

export {Badge};
