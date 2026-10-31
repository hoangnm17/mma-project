import { like, database, query, one } from "./db.js";
import { z } from "zod";
import { assert, normalizePhone, expectedDeparture } from "./domain.js";
import { quote } from "./services/hotel.js";
import { forecast } from "./services/forecast.js";
import { canAccessSpecial } from "./repository.js";
import { find } from "./mongo-store.js";
import { readOrdersResource } from "./services/orders.js";
import { dashboardReport } from "./services/reporting.js";
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
      : one(
          db,
          (p) => ({
            collection: "Users",
            filter: { id: p.userId },
            project: { id: 1, name: 1, role: 1, canAccessSpecialServices: 1 },
          }),
          args,
        );
  if (resource === "services") {
    const includeDisabled = params.includeDisabled === true || params.includeDisabled === "true";
    if (includeDisabled) assert(actor.kind === "staff" && actor.role === "Admin", "Chỉ Admin được xem dịch vụ đã ngừng", 403);
    return query(db, (p) => ({
      collection: "Services",
      filter: { ...(!includeDisabled ? { enabled: true } : {}), category: { $nin: ["FOOD", "SPECIAL"] } },
      sort: { name: 1 },
    }));
  }
  if (resource === "notifications") {
    assert(actor.kind === "staff", "Không có quyền", 403);
    const special = await canAccessSpecial(db, actor);
    return query(
      db,
      (p) => ({
        collection: "Notifications",
        filter: { userId: p.userId, ...(!special ? { eventKey: { $not: /^special:/ } } : {}) },
        sort: { createdAt: -1 },
        skip: p.offset,
        limit: 30,
      }),
      args,
    );
  }
  if (resource === "tasks") {
    if (actor.kind === "guest") return query(db, "guestTasks", args);
    if (actor.role === "Cleaner") return query(db, "cleanerTasks", args);
    return query(db, "deskTasks", args);
  }
  if (resource === "offers") {
    assert(actor.role === "Cleaner", "Không có quyền", 403);
    return query(db, "offers", args);
  }
  if (resource === "cleaner-status") {
    assert(actor.role === "Cleaner", "Không có quyền", 403);
    return one(db, "cleanerStatus", args);
  }
  if (resource === "guest-stay") {
    assert(actor.kind === "guest", "Không có quyền", 403);
    return one(db, "guestStay", args);
  }
  assert(
    actor.kind === "staff" && ["Admin", "Receptionist"].includes(actor.role),
    "Không có quyền xem dữ liệu",
    403,
  );
  if (["food-items", "food-orders", "special-services", "special-requests"].includes(resource))
    return readOrdersResource(db, actor, resource, { ...params, page });
  if (resource === "quote") {
    const stayId = z.string().uuid().parse(params.stayId);
    const result = await quote(db, stayId);
    if (!(await canAccessSpecial(db, actor))) {
      result.items = result.items.map((item) => item.category === "SPECIAL"
        ? { id: item.id, category: "SPECIAL", name: "Dịch vụ riêng", quantity: 1,
            unitPrice: item.unitPrice * item.quantity } : item);
    }
    return result;
  }
  if (resource === "rooms") return query(db, "rooms", { ...args,
    typeId: params.typeId ? z.string().uuid().parse(params.typeId) : undefined,
    status: params.status && params.status !== "ALL" ? z.enum(["READY", "OCCUPIED", "DIRTY", "MAINTENANCE", "DISABLED"]).parse(params.status) : undefined });
  if (resource === "customer-lookup") {
    const phone = normalizePhone(z.string().max(30).parse(params.phone));
    const rows = await find(db, "Customers");
    return rows.find((row) => { try { return normalizePhone(row.phone) === phone; } catch { return false; } }) || null;
  }
  if (resource === "customers")
    return query(
      db,
      (p) => ({
        collection: "Customers",
        filter: { $or: [{ name: like(p.search) }, { phone: like(p.search) }] },
        sort: { name: 1 },
        skip: p.offset,
        limit: 30,
      }),
      args,
    );
  if (resource === "customer-history") {
    const customerId = z.string().uuid().parse(params.customerId);
    return query(db, "customerHistory", { customerId });
  }
  if (resource === "room-history") {
    const roomId = z.string().uuid().parse(params.roomId);
    return query(db, "roomHistory", { roomId });
  }
  if (resource === "room-cleaning-history") {
    const roomId = z.string().uuid().parse(params.roomId);
    return query(db, "deskTasks", { ...args, roomId });
  }
  if (resource === "bookings") return query(db, "bookings", args);
  if (resource === "stays") return query(db, "stays", { ...args,
    status: params.status && params.status !== "ALL" ? z.enum(["OPEN", "CLOSED"]).parse(params.status) : undefined });
  if (resource === "invoices") return query(db, "invoices", { ...args,
    customerId: params.customerId ? z.string().uuid().parse(params.customerId) : undefined,
    paymentStatus: params.paymentStatus && params.paymentStatus !== "ALL"
      ? z.enum(["UNPAID", "PARTIAL", "PAID"]).parse(params.paymentStatus) : undefined });
  if (resource === "receipts") {
    const stayId = z.string().uuid().parse(params.stayId);
    return query(db, "stayReceipts", { stayId });
  }
  if (resource === "roomTypes")
    return query(db, (p) => ({
      collection: "RoomTypes",
      filter: {},
      sort: { name: 1 },
    }));
  if (resource === "campaign-options")
    return query(db, (p) => ({
      collection: "Campaigns",
      filter: {
        $and: [
          { startsAt: { $lte: new Date() } },
          { endsAt: { $gt: new Date() } },
        ],
      },
      project: { id: 1, name: 1 },
      sort: { name: 1 },
    }));
  if (resource === "maintenance") return query(db, "maintenance", args);
  if (resource === "cleaners") return query(db, "cleaners");
  if (resource === "dashboard") {
    assert(actor.role === "Admin" || (!params.from && !params.to), "Chỉ Admin được xem báo cáo", 403);
    const base = await one(db, "dashboard");
    if (actor.role !== "Admin") {
      const { revenue: _revenue, collected: _collected, debt: _debt, ...operations } = base;
      return operations;
    }
    return { ...base, ...await dashboardReport(db, params) };
  }
  if (resource === "incidents") return query(db, "incidents", args);
  if (resource === "booking-receipts") {
    const bookingId = z.string().uuid().parse(params.bookingId);
    return query(db, "bookingReceipts", { bookingId });
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
      end = params.end
        ? new Date(z.string().datetime({ offset: true }).parse(params.end))
        : expectedDeparture(start, z.enum(["HOUR", "NIGHT"]).parse(params.mode || "HOUR"));
    assert(end > start, "Khoảng giờ không hợp lệ", 400);
    const excludeBooking = params.excludeBooking
      ? z.string().uuid().parse(params.excludeBooking)
      : null;
    return query(db, "availability", { start, end, excludeBooking });
  }
  assert(actor.role === "Admin", "Chỉ Admin được xem", 403);
  if (resource === "campaigns") return query(db, "campaigns");
  if (resource === "vouchers") return query(db, "vouchers");
  if (resource === "users")
    return query(db, (p) => ({
      collection: "Users",
      filter: {},
      project: { id: 1, username: 1, name: 1, role: 1, enabled: 1, canAccessSpecialServices: 1 },
      sort: { name: 1 },
    }));
  if (resource === "audit")
    return query(
      db,
      (p) => ({
        collection: "AuditLogs",
        filter: {},
        sort: { createdAt: -1 },
        skip: p.offset,
        limit: 30,
      }),
      args,
    );
  assert(false, "Không có tài nguyên", 404);
}
