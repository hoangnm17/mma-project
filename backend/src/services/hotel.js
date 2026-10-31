import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { one, query } from "../db.js";
import {
  id,
  hash,
  audit,
  available,
  staff,
  guestStay,
  notifyDesk,
} from "../repository.js";
import {
  assert,
  money,
  timestamp,
  priceRoom,
  normalizePhone,
  expectedDeparture,
} from "../domain.js";
import { config } from "../config.js";
import { createTask } from "./housekeeping.js";
import { voucherDiscount } from "./crm.js";
const uuid = z.string().uuid();
const text = z.string().trim().min(1).max(120);
const method = z.enum(["CASH", "TRANSFER"]);
const desk = ["Admin", "Receptionist"];
const customerFields = z.object({
  name: text,
  phone: z.string().max(30).transform(normalizePhone),
  notes: z.string().max(500).optional(),
});
const schema = {
  customer: customerFields.extend({
    id: uuid.optional(),
  }),
  booking: z.object({
    id: uuid.optional(),
    roomId: uuid,
    customerId: uuid.optional(),
    customer: customerFields.optional(),
    startsAt: timestamp.optional(),
    endsAt: timestamp.optional(),
    guests: z.number().int().positive().max(20),
    mode: z.enum(["HOUR", "NIGHT"]),
    deposit: money.default(0),
    method: method.default("CASH"),
    source: z.string().min(1).max(80).default("Trực tiếp"),
    campaignId: uuid.nullable().default(null),
  }),
  checkin: z.object({
    bookingId: uuid.optional(),
    roomId: uuid.optional(),
    customerId: uuid.optional(),
    customer: customerFields.optional(),
    expectedEnd: timestamp.optional(),
    guests: z.number().int().positive().max(20).optional(),
    mode: z.enum(["HOUR", "NIGHT"]).optional(),
  }),
  receipt: z.object({
    stayId: uuid.optional(),
    bookingId: uuid.optional(),
    amount: money.refine((n) => n > 0),
    method,
  }),
  checkout: z.object({
    stayId: uuid,
    discount: money.default(0),
    surcharge: money.default(0),
    allowDebt: z.boolean().default(false),
    reason: z.string().max(500).default(""),
    voucherCode: z.string().max(40).optional(),
    finalTotal: money.optional(),
    adjustmentReason: z.string().trim().max(500).default(""),
    paymentAmount: money.default(0),
    paymentMethod: method.default("CASH"),
    payRemaining: z.boolean().default(false),
  }),
  serviceItem: z.object({
    stayId: uuid,
    serviceId: uuid,
    quantity: z.number().int().min(1).max(1000),
    itemId: uuid.optional(),
  }),
  user: z.object({
    id: uuid.optional(),
    username: z.string().regex(/^[a-zA-Z0-9_.-]{3,80}$/),
    name: text,
    role: z.enum(["Admin", "Receptionist", "Cleaner"]),
    enabled: z.boolean().default(true),
    canAccessSpecialServices: z.boolean().optional(),
    password: z.string().min(10).max(100).optional(),
  }),
  room: z.object({
    id: uuid.optional(),
    number: text,
    typeId: uuid,
    zone: text,
    enabled: z.boolean().default(true),
    photoUrl: z.string().url().max(500).nullable().default(null),
  }),
  roomType: z.object({
    id: uuid.optional(),
    name: text,
    capacity: z.number().int().positive().max(20),
    rate: z.object({
      hour: money,
      day: money.default(0),
      night: money,
      graceMinutes: z.number().int().min(0).max(60),
      extraHour: money,
    }),
  }),
  service: z.object({
    id: uuid.optional(),
    code: z.string().regex(/^[A-Z_]{2,30}$/),
    name: text,
    unit: text,
    price: money,
    cleaning: z.boolean().default(false),
    fullClean: z.boolean().default(false),
    enabled: z.boolean().default(true),
  }),
  cleaner: z.object({
    userId: uuid,
    zone: text,
    skills: z
      .array(z.enum(["FULL", "TURNOVER", "LINEN", "BATHROOM", "TOWELS"]))
      .min(1),
    startsAt: timestamp,
    endsAt: timestamp,
  }),
  maintenance: z.object({
    roomId: uuid,
    startsAt: timestamp,
    endsAt: timestamp,
    reason: z.string().min(3).max(500),
  }),
  refund: z.object({
    invoiceId: uuid,
    amount: money.refine((n) => n > 0),
    reason: z.string().min(5).max(500),
  }),
};
async function customerByPhone(tx, phone, excludeId = null) {
  const matches = (await query(tx, () => ({ collection: "Customers" }))).filter(
    (customer) => {
      if (customer.id === excludeId) return false;
      try {
        return normalizePhone(customer.phone) === phone;
      } catch {
        return false;
      }
    },
  );
  assert(matches.length <= 1, "Số điện thoại trùng nhiều hồ sơ, cần Admin kiểm tra");
  return matches[0];
}
async function resolveCustomer(tx, customerId, data) {
  let customer = customerId
    ? await one(tx, (p) => ({ collection: "Customers", filter: { id: p.id } }), {
        id: customerId,
      })
    : null;
  if (customerId) assert(customer, "Không có khách hàng", 404);
  if (data) {
    const phone = normalizePhone(data.phone);
    if (customer) {
      assert(
        normalizePhone(customer.phone) === phone,
        "Số điện thoại không khớp hồ sơ khách đã chọn",
        400,
      );
    } else customer = await customerByPhone(tx, phone);
    if (customer) {
      await query(tx, () => ({
        collection: "Customers",
        filter: { id: customer.id },
        update: {
          $set: {
            name: data.name,
            phone,
            notes: data.notes ?? customer.notes ?? "",
          },
        },
      }));
    } else {
      customer = { id: id(), name: data.name, phone, notes: data.notes ?? "" };
      await query(tx, () => ({ collection: "Customers", insert: customer }));
    }
  }
  assert(customer, "Cần chọn hoặc nhập khách hàng", 400);
  return customer.id;
}
export async function quote(tx, stayId, end = new Date()) {
  const stay = await one(
    tx,
    (p) => ({ collection: "Stays", filter: { id: p.stayId } }),
    {
      stayId,
    },
  );
  assert(stay, "Không tìm thấy lưu trú", 404);
  const invoice = await one(
    tx,
    (p) => ({ collection: "Invoices", filter: { stayId: p.stayId } }),
    {
      stayId,
    },
  );
  const items = await query(
    tx,
    (p) => ({ collection: "StayServiceItems", filter: { stayId: p.stayId } }),
    { stayId },
  );
  const room = invoice
    ? JSON.parse(invoice.roomJson)
    : priceRoom(JSON.parse(stay.rateJson), stay.startedAt, end, stay.mode);
  const paid =
    (
      await one(
        tx,
        (p) => ({
          collection: "Receipts",
          filter: { stayId: p.stayId },
          sum: "amount",
          as: "amount",
        }),
        { stayId },
      )
    ).amount - (await one(tx, "stayReturns", { stayId })).amount;
  const adjustments = invoice
    ? (
        await one(
          tx,
          (p) => ({
            collection: "Adjustments",
            filter: { invoiceId: p.id },
            sum: "amount",
            as: "amount",
          }),
          { id: invoice.id },
        )
      ).amount
    : 0;
  const refunded = invoice
    ? (
        await one(
          tx,
          (p) => ({
            collection: "Refunds",
            filter: { invoiceId: p.id },
            sum: "amount",
            as: "amount",
          }),
          { id: invoice.id },
        )
      ).amount
    : 0;
  const services = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );
  const total = invoice ? invoice.total - adjustments : room.total + services;
  return {
    stay,
    invoice,
    room,
    items,
    services,
    total,
    paid,
    refunded,
    adjustments,
    balance: total - paid + refunded,
    credit: Math.max(0, paid - refunded - total),
  };
}
export async function hotelAction(tx, actor, action, raw) {
  if (action === "guest-link") {
    await staff(tx, actor, desk);
    const { stayId } = z.object({ stayId: uuid }).parse(raw);
    const stay = await one(
      tx,
      (p) => ({
        collection: "Stays",
        filter: { $and: [{ id: p.stayId }, { status: "OPEN" }] },
        project: { id: 1 },
      }),
      { stayId },
    );
    assert(stay, "Lưu trú đã đóng");
    await query(
      tx,
      (p) => ({
        collection: "GuestAccessTokens",
        filter: { stayId: p.stayId },
        update: { $set: { revoked: true } },
      }),
      { stayId },
    );
    const token = randomBytes(32).toString("base64url");
    await query(
      tx,
      (p) => ({
        collection: "GuestAccessTokens",
        insert: {
          id: p.id,
          stayId: p.stayId,
          tokenHash: p.tokenHash,
          expiresAt: p.expiresAt,
        },
      }),
      {
        id: id(),
        stayId,
        tokenHash: hash(token),
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    );
    return { url: config.guestUrl + "#token=" + token };
  }
  if (action === "dnd") {
    const { stayId, dnd } = z
      .object({ stayId: uuid, dnd: z.boolean() })
      .parse(raw);
    await guestStay(tx, actor, stayId);
    await query(
      tx,
      (p) => ({
        collection: "Stays",
        filter: { $and: [{ id: p.stayId }, { status: "OPEN" }] },
        update: { $set: { dnd: p.dnd } },
      }),
      { stayId, dnd },
    );
    return { ok: true };
  }
  if (action === "password") {
    await staff(tx, actor, ["Admin", "Receptionist", "Cleaner"]);
    const b = z
      .object({
        current: z.string().max(100),
        password: z.string().min(10).max(100),
      })
      .parse(raw);
    const user = await one(
      tx,
      (p) => ({ collection: "Users", filter: { id: p.id } }),
      {
        id: actor.id,
      },
    );
    assert(
      await bcrypt.compare(b.current, user.passwordHash),
      "Mật khẩu hiện tại không đúng",
      400,
    );
    await query(
      tx,
      (p) => ({
        collection: "Users",
        filter: { id: p.id },
        update: {
          $set: { passwordHash: p.passwordHash },
          $inc: { authVersion: 1 },
        },
      }),
      { id: actor.id, passwordHash: await bcrypt.hash(b.password, 12) },
    );
    await query(
      tx,
      (p) => ({
        collection: "RefreshSessions",
        filter: { userId: p.id },
        update: { $set: { revoked: true } },
      }),
      {
        id: actor.id,
      },
    );
    return { ok: true };
  }
  if (action === "logout") {
    await staff(tx, actor, ["Admin", "Receptionist", "Cleaner"]);
    await query(
      tx,
      (p) => ({
        collection: "Users",
        filter: { id: p.id },
        update: { $inc: { authVersion: 1 } },
      }),
      {
        id: actor.id,
      },
    );
    await query(
      tx,
      (p) => ({
        collection: "RefreshSessions",
        filter: { userId: p.id },
        update: { $set: { revoked: true } },
      }),
      {
        id: actor.id,
      },
    );
    await query(
      tx,
      (p) => ({
        collection: "DeviceTokens",
        filter: { userId: p.id },
        delete: true,
      }),
      { id: actor.id },
    );
    return { ok: true };
  }
  if (action === "notification-read") {
    const b = z.object({ id: uuid }).parse(raw);
    await query(
      tx,
      (p) => ({
        collection: "Notifications",
        filter: { $and: [{ id: p.id }, { userId: p.userId }] },
        update: { $set: { isRead: true } },
      }),
      { id: b.id, userId: actor.id },
    );
    return { ok: true };
  }
  if (action === "device") {
    await staff(tx, actor, ["Admin", "Receptionist", "Cleaner"]);
    const b = z
      .object({
        token: z.string().regex(/^(Expo|Exponent)PushToken\[[\w-]+\]$/),
      })
      .parse(raw);
    await query(
      tx,
      (p) => ({
        collection: "DeviceTokens",
        filter: { token: p.token },
        delete: true,
      }),
      {
        token: b.token,
      },
    );
    await query(
      tx,
      (p) => ({
        collection: "DeviceTokens",
        insert: { token: p.token, userId: p.userId },
      }),
      { token: b.token, userId: actor.id },
    );
    return { ok: true };
  }
  const admin = [
    "user",
    "room",
    "roomType",
    "service",
    "cleaner",
    "refund",
    "receipt-return",
  ];
  await staff(tx, actor, admin.includes(action) ? ["Admin"] : desk);
  if (action === "receipt-return") {
    const b = z
      .object({
        receiptId: uuid,
        amount: money.refine((n) => n > 0),
        reason: z.string().min(5).max(500),
      })
      .parse(raw);
    const r = await one(
      tx,
      (p) => ({ collection: "Receipts", filter: { id: p.id } }),
      {
        id: b.receiptId,
      },
    );
    assert(r, "Không có phiếu thu", 404);
    if (r.stayId)
      assert(
        !(await one(
          tx,
          (p) => ({
            collection: "Invoices",
            filter: { stayId: p.id },
            project: { id: 1 },
          }),
          {
            id: r.stayId,
          },
        )),
        "Đã chốt hóa đơn: dùng hoàn tiền kèm điều chỉnh",
      );
    const returned = (
      await one(
        tx,
        (p) => ({
          collection: "ReceiptReturns",
          filter: { receiptId: p.id },
          sum: "amount",
          as: "amount",
        }),
        { id: r.id },
      )
    ).amount;
    assert(
      b.amount <= r.amount - returned,
      "Vượt số tiền còn lại của phiếu thu",
      400,
    );
    const rid = id();
    await query(
      tx,
      (p) => ({
        collection: "ReceiptReturns",
        insert: {
          id: p.id,
          receiptId: p.receiptId,
          amount: p.amount,
          reason: p.reason,
          actorId: p.actorId,
        },
      }),
      { ...b, id: rid, actorId: actor.id },
    );
    await audit(tx, actor, action, rid, b);
    return { id: rid };
  }
  if (action === "customer") {
    const b = schema.customer.parse(raw);
    const customerId = b.id || id();
    assert(
      !(await customerByPhone(tx, b.phone, b.id)),
      "Số điện thoại đã có hồ sơ khách hàng, hãy chọn hồ sơ hiện có",
    );
    if (b.id) {
      assert(
        await one(
          tx,
          (p) => ({
            collection: "Customers",
            filter: { id: p.id },
            project: { id: 1 },
          }),
          { id: b.id },
        ),
        "Không có khách hàng",
        404,
      );
      await query(
        tx,
        (p) => ({
          collection: "Customers",
          filter: { id: p.id },
          update: { $set: { name: p.name, phone: p.phone, notes: p.notes } },
        }),
        { ...b, id: customerId },
      );
    } else
      await query(
        tx,
        (p) => ({
          collection: "Customers",
          insert: { id: p.id, name: p.name, phone: p.phone, notes: p.notes },
        }),
        { ...b, id: customerId },
      );
    return { id: customerId };
  }
  if (action === "booking") {
    const b = schema.booking.parse(raw);
    const existing = b.id
      ? await one(tx, (p) => ({ collection: "Bookings", filter: { id: p.id } }), { id: b.id })
      : null;
    if (b.id) assert(existing?.status === "CONFIRMED", "Không thể sửa đặt phòng");
    b.startsAt ||= existing ? new Date(existing.startsAt).toISOString() : new Date().toISOString();
    b.endsAt ||= expectedDeparture(b.startsAt, b.mode).toISOString();
    b.customerId = await resolveCustomer(tx, b.customerId, b.customer);
    assert(
      new Date(b.endsAt) > new Date(b.startsAt) &&
        (new Date(b.startsAt) >= new Date(Date.now() - 60000) ||
          (existing && new Date(b.startsAt).getTime() === new Date(existing.startsAt).getTime())),
      "Khoảng đặt phòng không hợp lệ",
      400,
    );
    const room = await available(tx, b.roomId, b.startsAt, b.endsAt, b.id);
    assert(b.guests <= room.capacity, "Vượt sức chứa", 400);
    const bookingId = b.id || id();
    if (b.id) {
      const old = await one(
        tx,
        (p) => ({ collection: "Bookings", filter: { id: p.id } }),
        {
          id: b.id,
        },
      );
      assert(old?.status === "CONFIRMED", "Không thể sửa đặt phòng");
      assert(b.deposit === 0, "Thu thêm cọc qua phiếu thu", 400);
      await query(
        tx,
        (p) => ({
          collection: "Bookings",
          filter: { id: p.id },
          update: {
            $set: {
              roomId: p.roomId,
              customerId: p.customerId,
              startsAt: p.startsAt,
              endsAt: p.endsAt,
              guests: p.guests,
              mode: p.mode,
            },
          },
        }),
        {
          ...b,
          id: bookingId,
          startsAt: new Date(b.startsAt),
          endsAt: new Date(b.endsAt),
        },
      );
    } else {
      await query(
        tx,
        (p) => ({
          collection: "Bookings",
          insert: {
            id: p.id,
            roomId: p.roomId,
            customerId: p.customerId,
            startsAt: p.startsAt,
            endsAt: p.endsAt,
            guests: p.guests,
            mode: p.mode,
            status: "CONFIRMED",
          },
        }),
        {
          ...b,
          id: bookingId,
          startsAt: new Date(b.startsAt),
          endsAt: new Date(b.endsAt),
        },
      );
      if (b.deposit)
        await receipt(tx, actor, {
          bookingId,
          amount: b.deposit,
          method: b.method,
        });
    }
    await query(
      tx,
      (p) => ({
        collection: "Bookings",
        filter: { id: p.id },
        update: { $set: { source: p.source, campaignId: p.campaignId } },
      }),
      { ...b, id: bookingId },
    );
    await audit(tx, actor, action, bookingId);
    return { id: bookingId };
  }
  if (action === "booking-cancel") {
    const b = z.object({ id: uuid }).parse(raw);
    const booking = await one(
      tx,
      (p) => ({ collection: "Bookings", filter: { id: p.id } }),
      {
        id: b.id,
      },
    );
    assert(booking?.status === "CONFIRMED", "Đặt phòng không thể hủy");
    const deposit = await one(tx, "bookingDeposit", { id: b.id });
    assert(!deposit?.amount, "Đặt phòng có cọc: Admin hoàn cọc trước khi hủy");
    await query(
      tx,
      (p) => ({
        collection: "Bookings",
        filter: { id: p.id },
        update: { $set: { status: "CANCELLED" } },
      }),
      b,
    );
    await audit(tx, actor, action, b.id);
    return { ok: true };
  }
  if (action === "checkin") {
    let b = schema.checkin.parse(raw);
    const at = new Date();
    if (b.bookingId) {
      const booking = await one(
        tx,
        (p) => ({ collection: "Bookings", filter: { id: p.id } }),
        {
          id: b.bookingId,
        },
      );
      assert(booking?.status === "CONFIRMED", "Đặt phòng không hợp lệ");
      assert(
        new Date(booking.startsAt) <= new Date(Date.now() + 3600000),
        "Chỉ nhận phòng sớm tối đa 1 giờ",
      );
      b = {
        ...b,
        roomId: booking.roomId,
        customerId: booking.customerId,
        guests: booking.guests,
        mode: booking.mode,
        expectedEnd:
          new Date(booking.endsAt) > at
            ? new Date(booking.endsAt).toISOString()
            : expectedDeparture(at, booking.mode).toISOString(),
      };
    }
    assert(b.roomId && b.guests && b.mode, "Cần chọn phòng, số khách và hình thức thuê", 400);
    b.customerId = await resolveCustomer(tx, b.customerId, b.customer);
    b.expectedEnd ||= expectedDeparture(at, b.mode).toISOString();
    assert(
      new Date(b.expectedEnd) > at,
      "Giờ trả dự kiến phải trong tương lai",
      400,
    );
    const room = await available(tx, b.roomId, at, b.expectedEnd, b.bookingId);
    assert(room.cleanState === "CLEAN", "Phòng cần được dọn và xác nhận sạch");
    assert(b.guests <= room.capacity, "Vượt sức chứa", 400);
    const stayId = id();
    await query(
      tx,
      (p) => ({
        collection: "Rooms",
        filter: { id: p.id },
        update: { $inc: { cycle: 1 } },
      }),
      {
        id: b.roomId,
      },
    );
    await query(
      tx,
      (p) => ({
        collection: "Stays",
        insert: {
          id: p.id,
          roomId: p.roomId,
          customerId: p.customerId,
          bookingId: p.bookingId,
          startedAt: p.startedAt,
          expectedEnd: p.expectedEnd,
          status: "OPEN",
          guests: p.guests,
          mode: p.mode,
          rateJson: p.rateJson,
          cycle: p.cycle,
        },
      }),
      {
        ...b,
        id: stayId,
        bookingId: b.bookingId || null,
        startedAt: at,
        expectedEnd: new Date(b.expectedEnd),
        rateJson: room.rateJson,
        cycle: room.cycle + 1,
      },
    );
    if (b.bookingId) {
      await query(
        tx,
        (p) => ({
          collection: "Bookings",
          filter: { id: p.bookingId },
          update: { $set: { status: "CHECKED_IN" } },
        }),
        b,
      );
      await query(
        tx,
        (p) => ({
          collection: "Receipts",
          filter: { bookingId: p.bookingId },
          update: { $set: { stayId: p.stayId } },
        }),
        { stayId, bookingId: b.bookingId },
      );
      await query(tx, "copyBookingSource", { id: stayId });
    }
    await audit(tx, actor, action, stayId);
    return { id: stayId };
  }
  if (action === "receipt") {
    return receipt(tx, actor, schema.receipt.parse(raw));
  }
  if (action === "serviceItem") {
    const b = schema.serviceItem.parse(raw);
    assert(
      await one(
        tx,
        (p) => ({
          collection: "Stays",
          filter: { $and: [{ id: p.id }, { status: "OPEN" }] },
          project: { id: 1 },
        }),
        {
          id: b.stayId,
        },
      ),
      "Lưu trú đã đóng",
    );
    const service = await one(
      tx,
      (p) => ({
        collection: "Services",
        filter: {
          $and: [{ id: p.id }, { cleaning: false }],
        },
      }),
      { id: b.serviceId },
    );
    assert(service && (b.itemId || service.enabled), "Dịch vụ không hợp lệ", 400);
    assert(
      !service.category || service.category === "SERVICE",
      "Đồ ăn và dịch vụ riêng phải được tạo qua đơn yêu cầu",
      403,
    );
    assert(
      b.itemId || service.price * b.quantity <= 1000000000,
      "Giá trị dịch vụ vượt giới hạn",
      400,
    );
    const itemId = b.itemId || id();
    if (b.itemId) {
      const old = await one(
        tx,
        (p) => ({
          collection: "StayServiceItems",
          filter: { $and: [{ id: p.id }, { stayId: p.stayId }] },
        }),
        { id: b.itemId, stayId: b.stayId },
      );
      assert(
        old && !old.taskId && !old.orderId && old.serviceId === b.serviceId,
        "Không thể sửa mục dịch vụ",
      );
      assert(
        old.unitPrice * b.quantity <= 1000000000,
        "Giá trị dịch vụ vượt giới hạn",
        400,
      );
      await query(
        tx,
        (p) => ({
          collection: "StayServiceItems",
          filter: { id: p.id },
          update: { $set: { quantity: p.quantity } },
        }),
        { id: itemId, quantity: b.quantity },
      );
    } else
      await query(
        tx,
        (p) => ({
          collection: "StayServiceItems",
          insert: {
            id: p.id,
            stayId: p.stayId,
            serviceId: p.serviceId,
            name: p.name,
            unitPrice: p.unitPrice,
            quantity: p.quantity,
          },
        }),
        { ...b, id: itemId, name: service.name, unitPrice: service.price },
      );
    return { id: itemId };
  }
  if (action === "checkout") {
    const b = schema.checkout.parse(raw);
    assert(
      !b.payRemaining || b.paymentAmount === 0,
      "Chọn thu đủ phần còn lại hoặc nhập số tiền thanh toán",
      400,
    );
    assert(
      actor.role === "Admin" || !b.allowDebt,
      "Cho nợ cần Admin",
      403,
    );
    assert(
      b.finalTotal === undefined || (!b.discount && !b.surcharge),
      "Chọn điều chỉnh tổng tiền hoặc nhập giảm giá/phụ thu, không dùng đồng thời",
      400,
    );
    const end = new Date();
    const q = await quote(tx, b.stayId, end);
    assert(q.stay.status === "OPEN", "Đã trả phòng");
    assert(q.total + b.surcharge >= b.discount, "Giảm giá vượt tổng tiền", 400);
    const voucher = await voucherDiscount(
      tx,
      b.voucherCode,
      q.stay.customerId,
      q.total + b.surcharge - b.discount,
    );
    const originalTotal = Math.max(0, q.total - (voucher?.amount || 0));
    const calculatedTotal = q.total + b.surcharge - b.discount - (voucher?.amount || 0);
    const total = b.finalTotal ?? calculatedTotal;
    const adjustmentAmount = total - originalTotal;
    const adjustmentReason = b.adjustmentReason || b.reason.trim();
    const manuallyAdjusted = Boolean(b.discount || b.surcharge || adjustmentAmount);
    assert(
      !manuallyAdjusted || adjustmentReason.length >= 5,
      "Điều chỉnh tiền cần lý do ít nhất 5 ký tự",
      400,
    );
    b.discount += voucher?.amount || 0;
    if (total < calculatedTotal) b.discount += calculatedTotal - total;
    else b.surcharge += total - calculatedTotal;
    if (b.payRemaining) b.paymentAmount = Math.max(0, total - q.paid);
    assert(
      Number.isSafeInteger(total) && total >= 0 && total <= 1000000000,
      "Tổng hóa đơn vượt giới hạn",
      400,
    );
    assert(
      q.paid <= total,
      "Tiền thu vượt hóa đơn: cần xử lý tiền thừa trước khi chốt",
    );
    assert(
      q.paid + b.paymentAmount >= total || (b.allowDebt && b.reason.trim().length >= 5),
      "Cần thu đủ tiền hoặc Admin xác nhận công nợ có lý do",
    );
    assert(
      q.paid + b.paymentAmount <= total,
      "Số tiền thanh toán vượt số tiền còn phải trả",
      400,
    );
    const activeTask = await one(
      tx,
      (p) => ({
        collection: "HousekeepingTasks",
        filter: {
          $and: [
            { stayId: p.id },
            { status: { $in: ["IN_PROGRESS", "AWAITING_VERIFICATION"] } },
          ],
        },
        project: { id: 1 },
      }),
      { id: b.stayId },
    );
    assert(
      !activeTask,
      "Cần xử lý công việc đang làm/chờ kiểm tra trước khi trả phòng",
    );
    const pendingOrder = await one(tx, () => ({
      collection: "Orders",
      filter: { stayId: b.stayId, status: { $in: ["PENDING", "PREPARING"] } },
      project: { id: 1 },
    }));
    assert(!pendingOrder, "Cần hoàn thành hoặc hủy các đơn dịch vụ trước khi trả phòng");
    if (b.paymentAmount)
      await receipt(
        tx,
        actor,
        { stayId: b.stayId, amount: b.paymentAmount, method: b.paymentMethod },
        total,
      );
    const invoiceId = id();
    await query(
      tx,
      (p) => ({
        collection: "Invoices",
        insert: {
          id: p.id,
          stayId: p.stayId,
          total: p.total,
          roomJson: p.roomJson,
          discount: p.discount,
          surcharge: p.surcharge,
          debtReason: p.reason,
          originalTotal: p.originalTotal,
          adjustmentAmount: p.adjustmentAmount,
          adjustmentReason: p.adjustmentReason,
          adjustedBy: p.adjustedBy,
          adjustedAt: p.adjustedAt,
        },
      }),
      {
        ...b,
        id: invoiceId,
        total,
        originalTotal,
        adjustmentAmount,
        adjustmentReason: manuallyAdjusted ? adjustmentReason : "",
        adjustedBy: manuallyAdjusted ? actor.id : null,
        adjustedAt: manuallyAdjusted ? end : null,
        roomJson: JSON.stringify(q.room),
      },
    );
    if (voucher)
      await query(
        tx,
        (p) => ({
          collection: "VoucherRedemptions",
          insert: {
            id: p.id,
            voucherId: p.voucherId,
            customerId: p.customerId,
            invoiceId: p.invoiceId,
            amount: p.amount,
          },
        }),
        {
          id: id(),
          voucherId: voucher.id,
          customerId: q.stay.customerId,
          invoiceId,
          amount: voucher.amount,
        },
      );
    for (const line of [
      { name: "Tiền phòng", quantity: 1, unitPrice: q.room.total, category: "ROOM" },
      ...q.items,
    ])
      await query(
        tx,
        (p) => ({
          collection: "InvoiceLines",
          insert: {
            id: p.id,
            invoiceId: p.invoiceId,
            name: p.name,
            quantity: p.quantity,
            unitPrice: p.unitPrice,
            total: p.total,
            category: p.category,
          },
        }),
        {
          id: id(),
          invoiceId,
          name: line.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          total: line.quantity * line.unitPrice,
          category: line.category || "SERVICE",
        },
      );
    for (const r of await query(tx, "netStayReceipts", { stayId: b.stayId }))
      if (r.amount > 0)
        await query(
          tx,
          (p) => ({
            collection: "PaymentAllocations",
            insert: {
              receiptId: p.receiptId,
              invoiceId: p.invoiceId,
              amount: p.amount,
            },
          }),
          { receiptId: r.id, invoiceId, amount: r.amount },
        );
    await query(
      tx,
      (p) => ({
        collection: "Stays",
        filter: { id: p.id },
        update: { $set: { status: "CLOSED", endedAt: p.end } },
      }),
      { id: b.stayId, end },
    );
    await query(
      tx,
      (p) => ({
        collection: "Rooms",
        filter: { id: p.id },
        update: { $set: { cleanState: "DIRTY" } },
      }),
      {
        id: q.stay.roomId,
      },
    );
    await query(
      tx,
      (p) => ({
        collection: "GuestAccessTokens",
        filter: { stayId: p.stayId },
        update: { $set: { revoked: true } },
      }),
      { stayId: b.stayId },
    );
    await query(tx, "cancelStayAssignments", { end, stayId: b.stayId });
    await query(tx, "revokeStayOffers", { stayId: b.stayId });
    await query(
      tx,
      (p) => ({
        collection: "HousekeepingTasks",
        filter: {
          $and: [
            { stayId: p.stayId },
            { status: { $in: ["PENDING", "ASSIGNED"] } },
          ],
        },
        update: { $set: { status: "CANCELLED" }, $inc: { version: 1 } },
      }),
      { stayId: b.stayId },
    );
    await createTask(
      tx,
      actor,
      {
        stayId: b.stayId,
        serviceCode: "TURNOVER",
        windowStart: end.toISOString(),
        windowEnd: new Date(end.getTime() + 4 * 3600000).toISOString(),
        entryConsent: true,
        feeApproved: true,
        notes: "Dọn sau trả phòng",
      },
      true,
    );
    await audit(tx, actor, action, b.stayId, {
      invoiceId,
      originalTotal,
      total,
      adjustmentAmount,
      adjustmentReason: manuallyAdjusted ? adjustmentReason : "",
    });
    return { id: invoiceId, total };
  }
  if (action === "refund") {
    const b = schema.refund.parse(raw);
    const invoice = await one(
      tx,
      (p) => ({ collection: "Invoices", filter: { id: p.id } }),
      {
        id: b.invoiceId,
      },
    );
    assert(invoice, "Không có hóa đơn", 404);
    const q = await quote(tx, invoice.stayId);
    assert(
      b.amount <= q.total && b.amount <= q.paid - q.refunded,
      "Hoàn tiền vượt nghĩa vụ hoặc số tiền thực thu",
      400,
    );
    // Reduce the obligation and return the same amount atomically: no fabricated debt.
    for (const table of ["Refunds", "Adjustments"])
      await query(
        tx,
        (p) => ({
          collection: table,
          insert: {
            id: p.id,
            invoiceId: p.invoiceId,
            amount: p.amount,
            reason: p.reason,
            actorId: p.actorId,
          },
        }),
        { ...b, id: id(), actorId: actor.id },
      );
    await audit(tx, actor, action, b.invoiceId, b);
    return { ok: true };
  }
  if (action === "user") {
    const b = schema.user.parse(raw);
    const userId = b.id || id();
    if (b.id === actor.id)
      assert(
        b.enabled && b.role === "Admin",
        "Không thể tự khóa hoặc bỏ quyền Admin",
      );
    if (b.id) {
      const old = await one(
        tx,
        (p) => ({ collection: "Users", filter: { id: p.id } }),
        {
          id: b.id,
        },
      );
      assert(old, "Không tìm thấy tài khoản", 404);
      assert(
        b.role !== "Cleaner" || old.role === "Cleaner",
        "Tài khoản mới chỉ sử dụng vai trò Admin hoặc Receptionist",
        400,
      );
      assert(
        old.role !== "Cleaner" || b.role !== "Cleaner" || !b.enabled || old.enabled,
        "Tài khoản Cleaner cũ chỉ được giữ nguyên hoặc khóa, không mở lại",
        400,
      );
      b.canAccessSpecialServices ??= old.canAccessSpecialServices || false;
      if (old.role !== b.role)
        assert(
          !(await one(
            tx,
            (p) => ({
              collection: "CleaningAssignments",
              filter: { $and: [{ cleanerId: p.id }, { isActive: true }] },
              project: { id: 1 },
            }),
            { id: b.id },
          )),
          "Nhân viên có việc đang hoạt động",
        );
      await query(
        tx,
        (p) => ({
          collection: "Users",
          filter: { id: p.id },
          update: {
            $set: {
              username: p.username,
              name: p.name,
              role: p.role,
              enabled: p.enabled,
              canAccessSpecialServices: p.canAccessSpecialServices,
            },
            $inc: { authVersion: 1 },
          },
        }),
        { ...b, id: userId },
      );
      if (b.password)
        await query(
          tx,
          (p) => ({
            collection: "Users",
            filter: { id: p.id },
            update: { $set: { passwordHash: p.passwordHash } },
          }),
          { id: userId, passwordHash: await bcrypt.hash(b.password, 12) },
        );
      await query(
        tx,
        (p) => ({
          collection: "RefreshSessions",
          filter: { userId: p.id },
          update: { $set: { revoked: true } },
        }),
        {
          id: userId,
        },
      );
    } else {
      assert(b.role !== "Cleaner", "Chỉ tạo tài khoản Admin hoặc Receptionist", 400);
      assert(b.password, "Cần mật khẩu cho tài khoản mới", 400);
      await query(
        tx,
        (p) => ({
          collection: "Users",
          insert: {
            id: p.id,
            username: p.username,
            name: p.name,
            role: p.role,
            enabled: p.enabled,
            passwordHash: p.passwordHash,
            canAccessSpecialServices: p.canAccessSpecialServices || false,
          },
        }),
        { ...b, id: userId, passwordHash: await bcrypt.hash(b.password, 12) },
      );
    }
    await audit(tx, actor, action, userId, {
      role: b.role,
      enabled: b.enabled,
      canAccessSpecialServices: b.canAccessSpecialServices || false,
    });
    return { id: userId };
  }
  if (action === "roomType") {
    const b = schema.roomType.parse(raw);
    const typeId = b.id || id();
    if (b.id)
      await query(
        tx,
        (p) => ({
          collection: "RoomTypes",
          filter: { id: p.id },
          update: {
            $set: { name: p.name, capacity: p.capacity, rateJson: p.rateJson },
          },
        }),
        { ...b, id: typeId, rateJson: JSON.stringify(b.rate) },
      );
    else
      await query(
        tx,
        (p) => ({
          collection: "RoomTypes",
          insert: {
            id: p.id,
            name: p.name,
            capacity: p.capacity,
            rateJson: p.rateJson,
          },
        }),
        { ...b, id: typeId, rateJson: JSON.stringify(b.rate) },
      );
    return { id: typeId };
  }
  if (action === "room") {
    const b = schema.room.parse(raw);
    const roomId = b.id || id();
    if (b.id)
      await query(
        tx,
        (p) => ({
          collection: "Rooms",
          filter: { id: p.id },
          update: {
            $set: {
              number: p.number,
              typeId: p.typeId,
              zone: p.zone,
              enabled: p.enabled,
              photoUrl: p.photoUrl,
            },
          },
        }),
        { ...b, id: roomId },
      );
    else
      await query(
        tx,
        (p) => ({
          collection: "Rooms",
          insert: {
            id: p.id,
            number: p.number,
            typeId: p.typeId,
            zone: p.zone,
            enabled: p.enabled,
            photoUrl: p.photoUrl,
          },
        }),
        { ...b, id: roomId },
      );
    return { id: roomId };
  }
  if (action === "service") {
    const b = schema.service.parse(raw);
    assert(
      !b.cleaning,
      "Danh mục dọn phòng hệ thống được quản lý bằng migration",
      400,
    );
    const serviceId = b.id || id();
    if (b.id) {
      assert(
        await one(
          tx,
          (p) => ({
            collection: "Services",
            filter: {
              $and: [
                { id: p.id },
                { cleaning: false },
                { $or: [{ category: "SERVICE" }, { category: { $exists: false } }] },
              ],
            },
            project: { id: 1 },
          }),
          {
            id: b.id,
          },
        ),
        "Không sửa danh mục dọn phòng, đồ ăn hoặc dịch vụ riêng tại đây",
      );
      await query(
        tx,
        (p) => ({
          collection: "Services",
          filter: { id: p.id },
          update: {
            $set: {
              name: p.name,
              unit: p.unit,
              price: p.price,
              enabled: p.enabled,
            },
          },
        }),
        { ...b, id: serviceId },
      );
    } else
      await query(
        tx,
        (p) => ({
          collection: "Services",
          insert: {
            id: p.id,
            code: p.code,
            name: p.name,
            unit: p.unit,
            price: p.price,
            cleaning: p.cleaning,
            fullClean: p.fullClean,
            enabled: p.enabled,
          },
        }),
        { ...b, id: serviceId },
      );
    return { id: serviceId };
  }
  if (action === "cleaner") {
    const b = schema.cleaner.parse(raw);
    assert(new Date(b.endsAt) > new Date(b.startsAt), "Ca không hợp lệ", 400);
    assert(
      await one(
        tx,
        (p) => ({
          collection: "Users",
          filter: { $and: [{ id: p.id }, { role: "Cleaner" }] },
          project: { id: 1 },
        }),
        {
          id: b.userId,
        },
      ),
      "Tài khoản không phải nhân viên dọn phòng",
      400,
    );
    if (
      await one(
        tx,
        (p) => ({
          collection: "CleanerProfiles",
          filter: { userId: p.id },
          project: { userId: 1 },
        }),
        {
          id: b.userId,
        },
      )
    )
      await query(
        tx,
        (p) => ({
          collection: "CleanerProfiles",
          filter: { userId: p.userId },
          update: { $set: { zone: p.zone, skills: p.skills } },
        }),
        { ...b, skills: JSON.stringify(b.skills) },
      );
    else
      await query(
        tx,
        (p) => ({
          collection: "CleanerProfiles",
          insert: { userId: p.userId, zone: p.zone, skills: p.skills },
        }),
        { ...b, skills: JSON.stringify(b.skills) },
      );
    await query(
      tx,
      (p) => ({
        collection: "CleanerShifts",
        insert: {
          id: p.id,
          userId: p.userId,
          startsAt: p.startsAt,
          endsAt: p.endsAt,
        },
      }),
      {
        ...b,
        id: id(),
        startsAt: new Date(b.startsAt),
        endsAt: new Date(b.endsAt),
      },
    );
    return { ok: true };
  }
  if (action === "maintenance") {
    const b = schema.maintenance.parse(raw);
    assert(
      new Date(b.endsAt) > new Date(b.startsAt),
      "Lịch bảo trì không hợp lệ",
      400,
    );
    await available(tx, b.roomId, b.startsAt, b.endsAt);
    const mid = id();
    await query(
      tx,
      (p) => ({
        collection: "Maintenance",
        insert: {
          id: p.id,
          roomId: p.roomId,
          startsAt: p.startsAt,
          endsAt: p.endsAt,
          reason: p.reason,
        },
      }),
      {
        ...b,
        id: mid,
        startsAt: new Date(b.startsAt),
        endsAt: new Date(b.endsAt),
      },
    );
    await notifyDesk(tx, "Lịch bảo trì", b.reason, null, "maintenance:" + mid);
    return { id: mid };
  }
  if (action === "maintenance-resolve") {
    const b = z.object({ id: uuid }).parse(raw);
    await query(
      tx,
      (p) => ({
        collection: "Maintenance",
        filter: { id: p.id },
        update: { $set: { resolvedAt: new Date() } },
      }),
      b,
    );
    return { ok: true };
  }
  assert(false, "Không có hành động này", 404);
}
async function receipt(tx, actor, b, approvedTotal) {
  assert(b.stayId || b.bookingId, "Cần lượt ở hoặc đặt phòng", 400);
  assert(!(b.stayId && b.bookingId), "Chỉ chọn một nguồn thu", 400);
  if (b.bookingId)
    assert(
      await one(
        tx,
        (p) => ({
          collection: "Bookings",
          filter: { $and: [{ id: p.id }, { status: "CONFIRMED" }] },
          project: { id: 1 },
        }),
        { id: b.bookingId },
      ),
      "Đặt phòng không thể thu cọc",
    );
  let q;
  if (b.stayId) {
    q = await quote(tx, b.stayId);
    const balance = approvedTotal === undefined ? q.balance : approvedTotal - q.paid;
    assert(b.amount <= balance, "Số tiền vượt số dư phải thu", 400);
  }
  const rid = id();
  await query(
    tx,
    (p) => ({
      collection: "Receipts",
      insert: {
        id: p.id,
        bookingId: p.bookingId,
        stayId: p.stayId,
        amount: p.amount,
        method: p.method,
        actorId: p.actorId,
      },
    }),
    {
      ...b,
      id: rid,
      stayId: b.stayId || null,
      bookingId: b.bookingId || null,
      actorId: actor.id,
    },
  );
  if (q?.invoice)
    await query(
      tx,
      (p) => ({
        collection: "PaymentAllocations",
        insert: {
          receiptId: p.receiptId,
          invoiceId: p.invoiceId,
          amount: p.amount,
        },
      }),
      { receiptId: rid, invoiceId: q.invoice.id, amount: b.amount },
    );
  await audit(tx, actor, "receipt", rid, { amount: b.amount });
  return { id: rid };
}
