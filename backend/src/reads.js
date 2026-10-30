import { z } from "zod";
import { database, query, one } from "./db.js";
import { assert } from "./domain.js";
import { quote } from "./services/hotel.js";
import { forecast } from "./services/forecast.js";
export async function readResource(actor, resource, params = {}) {
  const db = await database();
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10000)
    .parse(params.page || 1);
  const search = z
    .string()
    .max(120)
    .parse(params.search || "");
  const args = {
    userId: actor.id || null,
    stayId: actor.stayId || null,
    offset: (page - 1) * 30,
    search: "%" + search + "%",
  };
  if (resource === "me")
    return actor.kind === "guest"
      ? { kind: "guest", stayId: actor.stayId }
      : one(db, "SELECT id,name,role FROM Users WHERE id=@userId", args);
  if (resource === "services")
    return query(db, "SELECT * FROM Services WHERE enabled=1 ORDER BY name");
  if (resource === "notifications") {
    assert(actor.kind === "staff", "Không có quyền", 403);
    return query(
      db,
      "SELECT * FROM Notifications WHERE userId=@userId ORDER BY createdAt DESC OFFSET @offset ROWS FETCH NEXT 30 ROWS ONLY",
      args,
    );
  }
  if (resource === "tasks") {
    if (actor.kind === "guest")
      return query(
        db,
        "SELECT t.*,s.name serviceName,s.code,r.number roomNumber FROM HousekeepingTasks t JOIN Services s ON s.id=t.serviceId JOIN Rooms r ON r.id=t.roomId WHERE t.stayId=@stayId ORDER BY t.createdAt DESC OFFSET @offset ROWS FETCH NEXT 30 ROWS ONLY",
        args,
      );
    if (actor.role === "Cleaner")
      return query(
        db,
        `SELECT t.id,t.roomId,t.status,t.windowStart,t.windowEnd,t.checklistJson,t.notes,t.version,s.name serviceName,s.code,r.number roomNumber,a.status assignmentStatus,a.isActive,a.id assignmentId,a.assignedAt,a.startedAt,a.submittedAt,a.closedAt
      FROM CleaningAssignments a JOIN HousekeepingTasks t ON t.id=a.taskId JOIN Services s ON s.id=t.serviceId JOIN Rooms r ON r.id=t.roomId WHERE a.cleanerId=@userId ORDER BY a.assignedAt DESC OFFSET @offset ROWS FETCH NEXT 30 ROWS ONLY`,
        args,
      );
    return query(
      db,
      "SELECT t.*,s.name serviceName,s.code,r.number roomNumber FROM HousekeepingTasks t JOIN Services s ON s.id=t.serviceId JOIN Rooms r ON r.id=t.roomId WHERE r.number LIKE @search ORDER BY t.createdAt DESC OFFSET @offset ROWS FETCH NEXT 30 ROWS ONLY",
      args,
    );
  }
  if (resource === "offers") {
    assert(actor.role === "Cleaner", "Không có quyền", 403);
    return query(
      db,
      `SELECT o.*,SYSUTCDATETIME() serverNow,t.notes,t.windowStart,t.windowEnd,r.number roomNumber,s.name serviceName FROM CleaningOffers o JOIN HousekeepingTasks t ON t.id=o.taskId JOIN Rooms r ON r.id=t.roomId JOIN Services s ON s.id=t.serviceId WHERE o.cleanerId=@userId AND o.status='PENDING' AND o.expiresAt>SYSUTCDATETIME() ORDER BY o.expiresAt`,
      args,
    );
  }
  if (resource === "cleaner-status") {
    assert(actor.role === "Cleaner", "Không có quyền", 403);
    return one(
      db,
      `SELECT c.*,CASE WHEN EXISTS(SELECT 1 FROM CleanerShifts s WHERE s.userId=c.userId AND s.startsAt<=SYSUTCDATETIME() AND s.endsAt>SYSUTCDATETIME()) THEN 1 ELSE 0 END inShift,CASE WHEN EXISTS(SELECT 1 FROM CleaningAssignments a WHERE a.cleanerId=c.userId AND a.isActive=1) THEN 1 ELSE 0 END busy FROM CleanerProfiles c WHERE c.userId=@userId`,
      args,
    );
  }
  if (resource === "guest-stay") {
    assert(actor.kind === "guest", "Không có quyền", 403);
    return one(
      db,
      "SELECT s.id,s.dnd,s.status,r.number FROM Stays s JOIN Rooms r ON r.id=s.roomId WHERE s.id=@stayId",
      args,
    );
  }
  assert(
    actor.kind === "staff" && ["Admin", "Receptionist"].includes(actor.role),
    "Không có quyền xem dữ liệu",
    403,
  );
  if (resource === "quote") {
    const stayId = z.string().uuid().parse(params.stayId);
    return quote(db, stayId);
  }
  if (resource === "rooms")
    return query(
      db,
      `SELECT r.*,t.name typeName,t.capacity,t.rateJson,s.id stayId,s.expectedEnd,
    CASE WHEN r.enabled=0 THEN 'DISABLED' WHEN EXISTS(SELECT 1 FROM Maintenance m WHERE m.roomId=r.id AND m.resolvedAt IS NULL AND m.startsAt<=SYSUTCDATETIME() AND m.endsAt>SYSUTCDATETIME()) THEN 'MAINTENANCE' WHEN s.id IS NOT NULL THEN 'OCCUPIED' WHEN r.cleanState='DIRTY' THEN 'DIRTY' ELSE 'READY' END status
    FROM Rooms r JOIN RoomTypes t ON t.id=r.typeId LEFT JOIN Stays s ON s.roomId=r.id AND s.status='OPEN' WHERE r.number LIKE @search ORDER BY r.number OFFSET @offset ROWS FETCH NEXT 30 ROWS ONLY`,
      args,
    );
  if (resource === "customers")
    return query(
      db,
      "SELECT * FROM Customers WHERE name LIKE @search OR phone LIKE @search ORDER BY name OFFSET @offset ROWS FETCH NEXT 30 ROWS ONLY",
      args,
    );
  if (resource === "customer-history") {
    const customerId = z.string().uuid().parse(params.customerId);
    return query(
      db,
      "SELECT s.*,r.number roomNumber,i.id invoiceId,i.total FROM Stays s JOIN Rooms r ON r.id=s.roomId LEFT JOIN Invoices i ON i.stayId=s.id WHERE s.customerId=@customerId ORDER BY s.startedAt DESC",
      { customerId },
    );
  }
  if (resource === "room-history") {
    const roomId = z.string().uuid().parse(params.roomId);
    return query(
      db,
      "SELECT s.*,c.name customerName FROM Stays s JOIN Customers c ON c.id=s.customerId WHERE s.roomId=@roomId ORDER BY s.startedAt DESC",
      { roomId },
    );
  }
  if (resource === "bookings")
    return query(
      db,
      "SELECT b.*,r.number roomNumber,c.name customerName,COALESCE((SELECT SUM(r.amount-COALESCE(rr.amount,0)) FROM Receipts r OUTER APPLY(SELECT SUM(amount) amount FROM ReceiptReturns WHERE receiptId=r.id)rr WHERE r.bookingId=b.id),0) deposit FROM Bookings b JOIN Rooms r ON r.id=b.roomId JOIN Customers c ON c.id=b.customerId ORDER BY b.startsAt DESC OFFSET @offset ROWS FETCH NEXT 30 ROWS ONLY",
      args,
    );
  if (resource === "stays")
    return query(
      db,
      "SELECT s.*,r.number roomNumber,c.name customerName FROM Stays s JOIN Rooms r ON r.id=s.roomId JOIN Customers c ON c.id=s.customerId ORDER BY s.startedAt DESC OFFSET @offset ROWS FETCH NEXT 30 ROWS ONLY",
      args,
    );
  if (resource === "invoices")
    return query(
      db,
      `SELECT i.*,r.number roomNumber,c.name customerName,COALESCE((SELECT SUM(amount) FROM Adjustments WHERE invoiceId=i.id),0) adjusted,COALESCE((SELECT SUM(amount) FROM Refunds WHERE invoiceId=i.id),0) refunded,COALESCE((SELECT SUM(r.amount-COALESCE(rr.amount,0)) FROM Receipts r OUTER APPLY(SELECT SUM(amount) amount FROM ReceiptReturns WHERE receiptId=r.id)rr WHERE r.stayId=s.id),0) paid FROM Invoices i JOIN Stays s ON s.id=i.stayId JOIN Rooms r ON r.id=s.roomId JOIN Customers c ON c.id=s.customerId ORDER BY i.createdAt DESC OFFSET @offset ROWS FETCH NEXT 30 ROWS ONLY`,
      args,
    );
  if (resource === "receipts") {
    const stayId = z.string().uuid().parse(params.stayId);
    return query(
      db,
      "SELECT r.id,r.amount,r.method,r.createdAt,COALESCE(rr.amount,0) returned FROM Receipts r OUTER APPLY(SELECT SUM(amount) amount FROM ReceiptReturns WHERE receiptId=r.id)rr WHERE r.stayId=@stayId ORDER BY r.createdAt DESC",
      { stayId },
    );
  }
  if (resource === "roomTypes")
    return query(db, "SELECT * FROM RoomTypes ORDER BY name");
  if (resource === "campaign-options")
    return query(
      db,
      "SELECT id,name FROM Campaigns WHERE startsAt<=SYSUTCDATETIME() AND endsAt>SYSUTCDATETIME() ORDER BY name",
    );
  if (resource === "maintenance")
    return query(
      db,
      "SELECT m.*,r.number roomNumber FROM Maintenance m JOIN Rooms r ON r.id=m.roomId ORDER BY m.startsAt DESC OFFSET @offset ROWS FETCH NEXT 30 ROWS ONLY",
      args,
    );
  if (resource === "cleaners")
    return query(
      db,
      `SELECT u.id,u.name,u.enabled,c.zone,c.skills,c.accepting,CASE WHEN EXISTS(SELECT 1 FROM CleaningAssignments a WHERE a.cleanerId=u.id AND a.isActive=1) THEN 1 ELSE 0 END busy,CASE WHEN EXISTS(SELECT 1 FROM CleanerShifts s WHERE s.userId=u.id AND s.startsAt<=SYSUTCDATETIME() AND s.endsAt>SYSUTCDATETIME()) THEN 1 ELSE 0 END inShift FROM Users u LEFT JOIN CleanerProfiles c ON c.userId=u.id WHERE u.role='Cleaner' ORDER BY u.name`,
    );
  if (resource === "dashboard")
    return one(
      db,
      `SELECT (SELECT COUNT(*) FROM Stays WHERE status='OPEN') occupied,(SELECT COUNT(*) FROM HousekeepingTasks WHERE status='PENDING') pending,(SELECT COUNT(*) FROM HousekeepingTasks WHERE status='AWAITING_VERIFICATION') verifying,(SELECT COALESCE(SUM(total),0) FROM Invoices)-(SELECT COALESCE(SUM(amount),0) FROM Adjustments) revenue,(SELECT COALESCE(SUM(amount),0) FROM Receipts)-(SELECT COALESCE(SUM(amount),0) FROM Refunds)-(SELECT COALESCE(SUM(amount),0) FROM ReceiptReturns) collected,(SELECT COALESCE(SUM(i.total-COALESCE(a.amount,0)-COALESCE(r.amount,0)+COALESCE(f.amount,0)),0) FROM Invoices i OUTER APPLY(SELECT SUM(amount) amount FROM Adjustments WHERE invoiceId=i.id)a OUTER APPLY(SELECT SUM(rc.amount-COALESCE(rr.amount,0)) amount FROM Receipts rc OUTER APPLY(SELECT SUM(amount) amount FROM ReceiptReturns WHERE receiptId=rc.id)rr WHERE rc.stayId=i.stayId)r OUTER APPLY(SELECT SUM(amount) amount FROM Refunds WHERE invoiceId=i.id)f) debt,(SELECT COUNT(*) FROM Bookings WHERE status='CONFIRMED' AND CONVERT(date,DATEADD(hour,7,startsAt))=CONVERT(date,DATEADD(hour,7,SYSUTCDATETIME()))) arrivals,(SELECT COUNT(*) FROM Stays WHERE status='OPEN' AND CONVERT(date,DATEADD(hour,7,expectedEnd))=CONVERT(date,DATEADD(hour,7,SYSUTCDATETIME()))) departures`,
    );
  if (resource === "incidents")
    return query(
      db,
      "SELECT i.*,r.number roomNumber FROM Incidents i JOIN Rooms r ON r.id=i.roomId ORDER BY i.createdAt DESC OFFSET @offset ROWS FETCH NEXT 30 ROWS ONLY",
      args,
    );
  if (resource === "booking-receipts") {
    const bookingId = z.string().uuid().parse(params.bookingId);
    return query(
      db,
      "SELECT r.*,COALESCE(rr.amount,0) returned FROM Receipts r OUTER APPLY(SELECT SUM(amount) amount FROM ReceiptReturns WHERE receiptId=r.id)rr WHERE r.bookingId=@bookingId",
      { bookingId },
    );
  }
  if (resource === "forecast")
    return forecast(
      db,
      z.coerce
        .number()
        .refine((n) => [7, 30].includes(n))
        .parse(params.days || 7),
    );
  if (resource === "availability") {
    const start = new Date(
        z.string().datetime({ offset: true }).parse(params.start),
      ),
      end = new Date(z.string().datetime({ offset: true }).parse(params.end));
    assert(end > start, "Khoảng giờ không hợp lệ", 400);
    const excludeBooking = params.excludeBooking
      ? z.string().uuid().parse(params.excludeBooking)
      : null;
    return query(
      db,
      `SELECT r.*,t.name typeName,t.capacity FROM Rooms r JOIN RoomTypes t ON t.id=r.typeId WHERE r.enabled=1 AND NOT EXISTS(SELECT 1 FROM Bookings b WHERE b.roomId=r.id AND b.status='CONFIRMED' AND (@excludeBooking IS NULL OR b.id<>@excludeBooking) AND b.startsAt<@end AND b.endsAt>@start) AND NOT EXISTS(SELECT 1 FROM Stays s WHERE s.roomId=r.id AND s.status='OPEN' AND (@start<s.expectedEnd OR s.expectedEnd<=SYSUTCDATETIME())) AND NOT EXISTS(SELECT 1 FROM Maintenance m WHERE m.roomId=r.id AND m.resolvedAt IS NULL AND m.startsAt<@end AND m.endsAt>@start) ORDER BY r.number`,
      { start, end, excludeBooking },
    );
  }
  assert(actor.role === "Admin", "Chỉ Admin được xem", 403);
  if (resource === "campaigns")
    return query(
      db,
      "SELECT c.*,COALESCE(x.revenue,0) attributedRevenue FROM Campaigns c OUTER APPLY(SELECT SUM(i.total-COALESCE(a.amount,0)) revenue FROM Invoices i JOIN Stays s ON s.id=i.stayId OUTER APPLY(SELECT SUM(amount) amount FROM Adjustments WHERE invoiceId=i.id)a WHERE s.campaignId=c.id)x ORDER BY c.startsAt DESC",
    );
  if (resource === "vouchers")
    return query(
      db,
      "SELECT v.*,(SELECT COUNT(*) FROM VoucherRedemptions r WHERE r.voucherId=v.id) uses FROM Vouchers v ORDER BY v.code",
    );
  if (resource === "users")
    return query(
      db,
      "SELECT id,username,name,role,enabled FROM Users ORDER BY name",
    );
  if (resource === "audit")
    return query(
      db,
      "SELECT * FROM AuditLogs ORDER BY createdAt DESC OFFSET @offset ROWS FETCH NEXT 30 ROWS ONLY",
      args,
    );
  assert(false, "Không có tài nguyên", 404);
}
