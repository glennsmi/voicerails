import {cn} from "../lib/utils.js";

export function BrandMark({className}: {className?: string}) {
  return (
    <img
      src="/logo-64.png"
      alt="VoiceRails logo"
      className={cn("size-8 rounded-sm object-contain", className)}
      loading="eager"
      decoding="async"
    />
  );
}

export function BrandWordmark({compact = false}: {compact?: boolean}) {
  return (
    <div className={cn("flex items-center gap-2", compact && "gap-1")}>
      <BrandMark className={cn(compact && "h-7 w-16")} />
      <span className={cn("font-mono text-sm font-semibold tracking-[0.08em] uppercase", compact && "hidden")}>
        <span className="text-[var(--text-primary)]">voice</span>
        <span className="text-[var(--accent)]">rails</span>
      </span>
    </div>
  );
}
