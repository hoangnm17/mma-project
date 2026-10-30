import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";
import { config } from "./config.js";
import { database, one, query, transaction } from "./db.js";
import { id, hash } from "./repository.js";
import { assert } from "./domain.js";
export function sign(payload, expiresIn = "8h") {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn,
    issuer: "stayflow",
    audience: "stayflow-app",
  });
}
export async function authenticateToken(token) {
  let actor;
  try {
    actor = jwt.verify(token, config.jwtSecret, {
      issuer: "stayflow",
      audience: "stayflow-app",
    });
  } catch {
    assert(false, "Phiên đăng nhập không hợp lệ", 401);
  }
  const db = await database();
  if (actor.kind === "staff") {
    const user = await one(
      db,
      "SELECT id,name,role,enabled,authVersion FROM Users WHERE id=@id",
      { id: actor.id },
    );
    assert(
      user?.enabled && user.authVersion === actor.authVersion,
      "Tài khoản bị khóa hoặc phiên hết hạn",
      401,
    );
    return { ...actor, ...user };
  }
  assert(actor.kind === "guest", "Phiên không hợp lệ", 401);
  const access = await one(
    db,
    "SELECT g.id FROM GuestAccessTokens g JOIN Stays s ON s.id=g.stayId WHERE g.id=@id AND g.revoked=0 AND g.expiresAt>SYSUTCDATETIME() AND s.status='OPEN'",
    { id: actor.accessId },
  );
  assert(access, "Link khách đã hết hiệu lực", 401);
  return actor;
}
export async function authenticate(req, res, next) {
  try {
    req.actor = await authenticateToken(
      (req.headers.authorization || "").replace(/^Bearer /, ""),
    );
    next();
  } catch (e) {
    next(e);
  }
}
export async function login(username, password) {
  return transaction(async (tx) => {
    const user = await one(tx, "SELECT * FROM Users WHERE username=@username", {
      username,
    });
    assert(
      user &&
        (await bcrypt.compare(password, user.passwordHash)) &&
        user.enabled,
      "Tên đăng nhập hoặc mật khẩu không đúng",
      401,
    );
    return session(tx, user);
  });
}
async function session(tx, user) {
  const refresh = randomBytes(32).toString("base64url");
  await query(
    tx,
    "INSERT RefreshSessions(id,userId,tokenHash,expiresAt) VALUES(@id,@userId,@tokenHash,@expiresAt)",
    {
      id: id(),
      userId: user.id,
      tokenHash: hash(refresh),
      expiresAt: new Date(Date.now() + 7 * 86400000),
    },
  );
  const publicUser = { id: user.id, name: user.name, role: user.role };
  return {
    user: publicUser,
    token: sign({
      ...publicUser,
      kind: "staff",
      authVersion: user.authVersion,
    }),
    refreshToken: refresh,
  };
}
export async function refresh(refreshToken) {
  return transaction(async (tx) => {
    const old = await one(
      tx,
      "SELECT r.id sessionId,u.* FROM RefreshSessions r JOIN Users u ON u.id=r.userId WHERE r.tokenHash=@tokenHash AND r.revoked=0 AND r.expiresAt>SYSUTCDATETIME() AND u.enabled=1",
      { tokenHash: hash(refreshToken) },
    );
    assert(old, "Phiên làm mới không hợp lệ", 401);
    await query(tx, "UPDATE RefreshSessions SET revoked=1 WHERE id=@id", {
      id: old.sessionId,
    });
    return session(tx, old);
  });
}
export async function exchange(token) {
  return transaction(async (tx) => {
    const access = await one(
      tx,
      "SELECT g.*,r.number FROM GuestAccessTokens g JOIN Stays s ON s.id=g.stayId JOIN Rooms r ON r.id=s.roomId WHERE g.tokenHash=@tokenHash AND g.revoked=0 AND g.expiresAt>SYSUTCDATETIME() AND s.status='OPEN'",
      { tokenHash: hash(token) },
    );
    assert(access, "Link không hợp lệ hoặc đã hết hạn", 401);
    return {
      token: sign(
        { kind: "guest", stayId: access.stayId, accessId: access.id },
        "2h",
      ),
      room: access.number,
      stayId: access.stayId,
    };
  });
}
