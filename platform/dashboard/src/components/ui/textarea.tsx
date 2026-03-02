import * as React from "react";
import {cn} from "../../lib/utils.js";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({className, ...props}, ref) => {
    return (
      <textarea
        className={cn(
          "min-h-[88px] w-full rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm " +
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
Textarea.displayName = "Textarea";

export {Textarea};
