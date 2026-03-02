import type {NextFunction, Request, Response} from "express";
import type {TenantContext} from "../types.js";

const roleRank: Record<TenantContext["role"], number> = {
  owner: 5,
  admin: 4,
  developer: 3,
  builder: 2,
  viewer: 1,
};

export function requireRole(minRole: TenantContext["role"]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.tenant?.role;
    if (!role || roleRank[role] < roleRank[minRole]) {
      res.status(403).json({
        error: {
          code: "forbidden",
          message: `Requires role ${minRole} or higher`,
          status: 403,
        },
      });
      return;
    }
    next();
  };
}
