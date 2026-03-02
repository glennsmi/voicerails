import * as React from "react";
import {Slot} from "@radix-ui/react-slot";
import {cva, type VariantProps} from "class-variance-authority";
import {cn} from "../../lib/utils.js";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all " +
    "outline-none disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--accent)] " +
    "focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--accent)] text-[#04130f] hover:bg-[var(--accent-dim)]",
        secondary:
          "border border-[var(--border-bright)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]",
        ghost:
          "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]",
        destructive:
          "border border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-6",
        icon: "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({className, variant, size, asChild = false, ...props}, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({variant, size, className}))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export {Button, buttonVariants};
