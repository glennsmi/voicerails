import type {NextFunction, Request, Response} from "express";
import {API_KEY_PREFIXES, DEFAULT_TENANT} from "../config.js";
import type {TenantContext} from "../types.js";

declare module "express-serve-static-core" {
  interface Request {
    tenant?: TenantContext;
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({
      error: {
        code: "unauthenticated",
        message: "Missing Authorization bearer token",
        status: 401,
      },
    });
    return;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!API_KEY_PREFIXES.some((prefix) => token.startsWith(prefix))) {
    res.status(403).json({
      error: {
        code: "forbidden",
        message: "Invalid VoiceRails API key format",
        status: 403,
      },
    });
    return;
  }

  req.tenant = {
    orgId: req.header("x-org-id") ?? DEFAULT_TENANT.orgId,
    appId: req.header("x-app-id") ?? DEFAULT_TENANT.appId,
    envId: req.header("x-env-id") ?? DEFAULT_TENANT.envId,
    role: (req.header("x-voicerails-role") as TenantContext["role"]) ?? "developer",
  };
  next();
}
