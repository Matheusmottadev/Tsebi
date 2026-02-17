const { findUserById, normalizeEmail, publicUser } = require("../user-repository");

function readAdminEmailSet() {
  const raw = `${process.env.ADMIN_EMAILS || ""},${process.env.ADMIN_EMAIL || ""}`;
  return new Set(
    raw
      .split(",")
      .map((item) => normalizeEmail(item))
      .filter(Boolean)
  );
}

async function requireAdmin(req, res, next) {
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }

  const user = await findUserById(userId);
  if (!user) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }

  const adminEmails = readAdminEmailSet();
  if (!adminEmails.size) {
    return res.status(403).json({ error: "ADMIN_NOT_CONFIGURED" });
  }

  if (!adminEmails.has(normalizeEmail(user.email))) {
    return res.status(403).json({ error: "FORBIDDEN" });
  }

  req.adminUser = publicUser(user);
  return next();
}

module.exports = {
  requireAdmin
};
