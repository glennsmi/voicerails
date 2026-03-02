import type {NextFunction, Request, Response} from "express";
import {randomUUID} from "node:crypto";

declare module "express-serve-static-core" {
  interface Request {
    requestId?: string;
  }
}

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.header("x-request-id") ?? randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}
