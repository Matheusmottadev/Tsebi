"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ error: "UNAUTHORIZED" });
    }
    return next();
}
module.exports = {
    requireAuth
};
//# sourceMappingURL=requireAuth.js.map