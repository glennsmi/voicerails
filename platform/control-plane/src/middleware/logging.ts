import type {NextFunction, Request, Response} from "express";

export function loggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const started = Date.now();
  res.on("finish", () => {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        level: "info",
        message: "http_request",
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - started,
        requestId: req.requestId,
        orgId: req.tenant?.orgId,
        appId: req.tenant?.appId,
        envId: req.tenant?.envId,
      }),
    );
  });
  next();
}
