const crypto = require("crypto");
const config = require("./config");

const b64url = (value) => Buffer.from(value).toString("base64url");

function signToken(user) {
  const payload = b64url(JSON.stringify({
    sub: user.username,
    role: user.role,
    residence: user.residence || null,
    exp: Math.floor(Date.now() / 1000) + config.AUTH_TTL_S,
  }));
  const sig = crypto.createHmac("sha256", config.AUTH_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", config.AUTH_SECRET).update(payload).digest();
  let received;
  try { received = Buffer.from(sig, "base64url"); } catch { return null; }
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;
  try {
    const user = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return user.exp > Math.floor(Date.now() / 1000) ? user : null;
  } catch { return null; }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

function checkPassword(password, encoded) {
  const [kind, salt64, hash64] = String(encoded || "").split("$");
  if (kind !== "scrypt" || !salt64 || !hash64) return false;
  const expected = Buffer.from(hash64, "base64url");
  const actual = crypto.scryptSync(password, Buffer.from(salt64, "base64url"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").filter(Boolean).map((part) => {
    const i = part.indexOf("=");
    return [part.slice(0, i).trim(), decodeURIComponent(part.slice(i + 1))];
  }));
}

function sessionCookie(token, maxAge = config.AUTH_TTL_S) {
  const secure = config.COOKIE_SECURE ? "; Secure" : "";
  return `${config.AUTH_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function authenticate(req, res, next) {
  const user = verifyToken(cookies(req)[config.AUTH_COOKIE]);
  if (!user) return res.status(401).json({ error: "authentication_required" });
  req.user = user;
  next();
}

function allow(...roles) {
  return (req, res, next) => roles.includes(req.user?.role)
    ? next()
    : res.status(403).json({ error: "forbidden" });
}

function publicUser(user) {
  return { username: user.username || user.sub, role: user.role, residence: user.residence || null };
}

module.exports = { signToken, hashPassword, checkPassword, sessionCookie, authenticate, allow, publicUser };
