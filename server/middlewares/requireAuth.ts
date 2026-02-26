import type { NextFunction, Request, Response } from "express";

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }
  return next();
}

module.exports = {
  requireAuth
};
