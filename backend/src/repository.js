import { randomUUID, createHash } from "node:crypto";
import { one, query } from "./db.js";
import { assert } from "./domain.js";
export const id = () => randomUUID();
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const now = () => new Date();
export async function canAccessSpecial(tx, actor) {
  if (actor.kind !== "staff") return false;
  const user = await one(tx, () => ({ collection: "Users", filter: { id: actor.id },
    project: { role: 1, enabled: 1, authVersion: 1, canAccessSpecialServices: 1 } }));
  return !!(user?.enabled && user.authVersion === actor.authVersion &&
    (user.role === "Admin" || (user.role === "Receptionist" && user.canAccessSpecialServices === true)));
}
export async function audit(tx, actor, action, entityId, details = {}) {
  await query(
    tx,
    (p) => ({
      collection: "AuditLogs",
      insert: {
        id: p.id,
        actorId: p.actorId,
        action: p.action,
        entityId: p.entityId,
        details: p.details,
      },
    }),
    {
      id: id(),
      actorId: actor.kind === "staff" ? actor.id : null,
      action,
      entityId,
      details: JSON.stringify(details),
    },
  );
}
export async function notify(tx, userId, title, body, taskId, eventKey) {
  const payload = { title, body, taskId, eventKey };
  if (
    await one(
      tx,
      (p) => ({
        collection: "OutboxEvents",
        filter: { eventKey: p.eventKey },
        project: { id: 1 },
      }),
      {
        eventKey,
      },
    )
  )
    return;
  await query(
    tx,
    (p) => ({
      collection: "Notifications",
      insert: {
        id: p.id,
        userId: p.userId,
        title: p.title,
        body: p.body,
        taskId: p.taskId,
        eventKey: p.eventKey,
      },
    }),
    { id: id(), userId, title, body, taskId, eventKey },
  );
  await query(
    tx,
    (p) => ({
      collection: "OutboxEvents",
      insert: {
        id: p.id,
        eventKey: p.eventKey,
        userId: p.userId,
        payloadJson: p.payloadJson,
      },
    }),
    { id: id(), eventKey, userId, payloadJson: JSON.stringify(payload) },
  );
}
export async function notifyDesk(tx, title, body, taskId, eventKey) {
  for (const user of await query(tx, (p) => ({
    collection: "Users",
    filter: {
      $and: [{ enabled: true }, { role: { $in: ["Admin", "Receptionist"] } }],
    },
    project: { id: 1 },
  })))
    await notify(tx, user.id, title, body, taskId, eventKey + ":" + user.id);
}
export async function available(tx, roomId, start, end, excludeBooking = null) {
  const room = await one(tx, "roomType", { roomId });
  assert(room && room.enabled, "Phòng không hoạt động");
  const clash = await one(tx, "roomClash", {
    roomId,
    startsAt: new Date(start),
    endsAt: new Date(end),
    excludeBooking,
  });
  assert(!clash, "Phòng có lịch trùng, đang lưu trú hoặc bảo trì");
  return room;
}
export async function staff(tx, actor, roles) {
  assert(
    actor.kind === "staff" && roles.includes(actor.role),
    "Không có quyền thực hiện",
    403,
  );
  const u = await one(
    tx,
    (p) => ({
      collection: "Users",
      filter: { id: p.id },
      project: { enabled: 1, authVersion: 1 },
    }),
    { id: actor.id },
  );
  assert(
    u?.enabled && u.authVersion === actor.authVersion,
    "Phiên đăng nhập đã hết hạn",
    401,
  );
}
export async function guestStay(tx, actor, stayId, allowClosed = false) {
  if (actor.kind === "staff") {
    await staff(tx, actor, ["Admin", "Receptionist"]);
    return;
  }
  assert(
    actor.kind === "guest" && actor.stayId === stayId,
    "Không có quyền với lượt lưu trú",
    403,
  );
  const token = await one(tx, "guestAccess", { id: actor.accessId });
  assert(
    token &&
      !token.revoked &&
      new Date(token.expiresAt) > now() &&
      (allowClosed || token.status === "OPEN"),
    "Link khách đã hết hiệu lực",
    401,
  );
}
