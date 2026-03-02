import * as React from "react";
import {cn} from "../../lib/utils.js";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({className, type, ...props}, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-sm " +
            "text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition-colors " +
            "focus-visible:border-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[var(--accent-glow)]",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export {Input};
