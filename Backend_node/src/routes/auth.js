const express = require("express");
const { signToken, hashPassword, checkPassword, sessionCookie, authenticate, publicUser } = require("../auth");

const USER_RE = /^[a-zA-Z0-9._-]{3,32}$/;

module.exports = function authRouter(store) {
  const router = express.Router();

  router.post("/auth/register", async (req, res, next) => {
    try {
      const username = String(req.body?.username || "").trim().toLowerCase();
      const password = String(req.body?.password || "");
      const role = req.body?.role;
      const residence = String(req.body?.residence || "").trim().toUpperCase();
      if (!USER_RE.test(username)) return res.status(400).json({ error: "invalid_username" });
      if (password.length < 8 || password.length > 128) return res.status(400).json({ error: "invalid_password", min: 8, max: 128 });
      if (!["resident", "staff"].includes(role)) return res.status(400).json({ error: "invalid_role" });
      if (role === "resident" && !residence) return res.status(400).json({ error: "residence_required" });
      const user = await store.createUser(username, {
        password_hash: hashPassword(password), role,
        residence: role === "resident" ? residence : null,
        created_at: new Date().toISOString(),
      });
      if (!user) return res.status(409).json({ error: "username_taken" });
      res.setHeader("Set-Cookie", sessionCookie(signToken(user)));
      res.status(201).json({ ok: true, user: publicUser(user) });
    } catch (e) { next(e); }
  });

  router.post("/auth/login", async (req, res, next) => {
    try {
      const username = String(req.body?.username || "").trim().toLowerCase();
      const user = await store.getUser(username);
      if (!user || !checkPassword(String(req.body?.password || ""), user.password_hash)) {
        return res.status(401).json({ error: "invalid_credentials" });
      }
      res.setHeader("Set-Cookie", sessionCookie(signToken(user)));
      res.json({ ok: true, user: publicUser(user) });
    } catch (e) { next(e); }
  });

  router.post("/auth/logout", (_req, res) => {
    res.setHeader("Set-Cookie", sessionCookie("", 0));
    res.json({ ok: true });
  });
  router.get("/auth/me", authenticate, (req, res) => res.json({ user: publicUser(req.user) }));
  return router;
};
