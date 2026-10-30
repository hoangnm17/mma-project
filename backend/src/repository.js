import { randomUUID, createHash } from "node:crypto";
import { one, query } from "./db.js";
import { assert } from "./domain.js";
export const id = () => randomUUID();
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const now = () => new Date();
export async function audit(tx, actor, action, entityId, details = {}) {
  await query(
    tx,
    "INSERT AuditLogs(id,actorId,action,entityId,details) VALUES(@id,@actorId,@action,@entityId,@details)",
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
    await one(tx, "SELECT id FROM OutboxEvents WHERE eventKey=@eventKey", {
      eventKey,
    })
  )
    return;
  await query(
    tx,
    "INSERT Notifications(id,userId,title,body,taskId,eventKey) VALUES(@id,@userId,@title,@body,@taskId,@eventKey)",
    { id: id(), userId, title, body, taskId, eventKey },
  );
  await query(
    tx,
    "INSERT OutboxEvents(id,eventKey,userId,payloadJson) VALUES(@id,@eventKey,@userId,@payloadJson)",
    { id: id(), eventKey, userId, payloadJson: JSON.stringify(payload) },
  );
}
export async function notifyDesk(tx, title, body, taskId, eventKey) {
  for (const user of await query(
    tx,
    "SELECT id FROM Users WHERE enabled=1 AND role IN ('Admin','Receptionist')",
  ))
    await notify(tx, user.id, title, body, taskId, eventKey + ":" + user.id);
}
export async function available(tx, roomId, start, end, excludeBooking = null) {
  const room = await one(
    tx,
    "SELECT r.*,t.capacity,t.rateJson FROM Rooms r JOIN RoomTypes t ON t.id=r.typeId WHERE r.id=@roomId",
    { roomId },
  );
  assert(room && room.enabled, "Phòng không hoạt động");
  const clash = await one(
    tx,
    `SELECT TOP 1 id FROM Bookings WHERE roomId=@roomId AND status='CONFIRMED' AND (@excludeBooking IS NULL OR id<>@excludeBooking) AND startsAt<@endsAt AND endsAt>@startsAt
    UNION ALL SELECT id FROM Stays WHERE roomId=@roomId AND status='OPEN' AND (@startsAt<expectedEnd OR expectedEnd<=SYSUTCDATETIME())
    UNION ALL SELECT id FROM Maintenance WHERE roomId=@roomId AND resolvedAt IS NULL AND startsAt<@endsAt AND endsAt>@startsAt`,
    {
      roomId,
      startsAt: new Date(start),
      endsAt: new Date(end),
      excludeBooking,
    },
  );
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
    "SELECT enabled,authVersion FROM Users WHERE id=@id",
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
  const token = await one(
    tx,
    "SELECT g.*,s.status FROM GuestAccessTokens g JOIN Stays s ON s.id=g.stayId WHERE g.id=@id",
    { id: actor.accessId },
  );
  assert(
    token &&
      !token.revoked &&
      new Date(token.expiresAt) > now() &&
      (allowClosed || token.status === "OPEN"),
    "Link khách đã hết hiệu lực",
    401,
  );
}
