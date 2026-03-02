import type {NextFunction, Request, Response} from "express";

const requestCounters = new Map<string, {count: number; resetAt: number}>();

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const key = req.header("authorization") ?? req.ip ?? "unknown";
  const now = Date.now();
  const current = requestCounters.get(key);
  const windowMs = 60_000;
  const maxPerWindow = 300;

  if (!current || current.resetAt < now) {
    requestCounters.set(key, {count: 1, resetAt: now + windowMs});
    next();
    return;
  }

  if (current.count >= maxPerWindow) {
    res.status(429).json({
      error: {
        code: "rate_limited",
        message: "Too many requests",
        status: 429,
      },
    });
    return;
  }

  current.count += 1;
  requestCounters.set(key, current);
  next();
}
