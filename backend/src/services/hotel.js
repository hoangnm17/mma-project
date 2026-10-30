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
import { assert, money, timestamp, priceRoom } from "../domain.js";
import { config } from "../config.js";
import { createTask } from "./housekeeping.js";
import { voucherDiscount } from "./crm.js";
const uuid = z.string().uuid();
const text = z.string().trim().min(1).max(120);
const method = z.enum(["CASH", "TRANSFER"]);
const desk = ["Admin", "Receptionist"];
const schema = {
  customer: z.object({
    id: uuid.optional(),
    name: text,
    phone: z.string().regex(/^[+0-9 ()-]{8,25}$/),
    notes: z.string().max(500).default(""),
  }),
  booking: z.object({
    id: uuid.optional(),
    roomId: uuid,
    customerId: uuid,
    startsAt: timestamp,
    endsAt: timestamp,
    guests: z.number().int().positive().max(20),
    mode: z.enum(["HOUR", "NIGHT", "DAY"]),
    deposit: money.default(0),
    method: method.default("CASH"),
    source: z.string().min(1).max(80).default("Trực tiếp"),
    campaignId: uuid.nullable().default(null),
  }),
  checkin: z.object({
    bookingId: uuid.optional(),
    roomId: uuid,
    customerId: uuid,
    expectedEnd: timestamp,
    guests: z.number().int().positive().max(20),
    mode: z.enum(["HOUR", "NIGHT", "DAY"]),
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
      day: money,
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
export async function quote(tx, stayId, end = new Date()) {
  const stay = await one(tx, "SELECT * FROM Stays WHERE id=@stayId", {
    stayId,
  });
  assert(stay, "Không tìm thấy lưu trú", 404);
  const invoice = await one(tx, "SELECT * FROM Invoices WHERE stayId=@stayId", {
    stayId,
  });
  const items = await query(
    tx,
    "SELECT * FROM StayServiceItems WHERE stayId=@stayId",
    { stayId },
  );
  const room = invoice
    ? JSON.parse(invoice.roomJson)
    : priceRoom(JSON.parse(stay.rateJson), stay.startedAt, end, stay.mode);
  const paid =
    (
      await one(
        tx,
        "SELECT COALESCE(SUM(amount),0) amount FROM Receipts WHERE stayId=@stayId",
        { stayId },
      )
    ).amount -
    (
      await one(
        tx,
        "SELECT COALESCE(SUM(rr.amount),0) amount FROM ReceiptReturns rr JOIN Receipts r ON r.id=rr.receiptId WHERE r.stayId=@stayId",
        { stayId },
      )
    ).amount;
  const adjustments = invoice
    ? (
        await one(
          tx,
          "SELECT COALESCE(SUM(amount),0) amount FROM Adjustments WHERE invoiceId=@id",
          { id: invoice.id },
        )
      ).amount
    : 0;
  const refunded = invoice
    ? (
        await one(
          tx,
          "SELECT COALESCE(SUM(amount),0) amount FROM Refunds WHERE invoiceId=@id",
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
      "SELECT id FROM Stays WHERE id=@stayId AND status='OPEN'",
      { stayId },
    );
    assert(stay, "Lưu trú đã đóng");
    await query(
      tx,
      "UPDATE GuestAccessTokens SET revoked=1 WHERE stayId=@stayId",
      { stayId },
    );
    const token = randomBytes(32).toString("base64url");
    await query(
      tx,
      "INSERT GuestAccessTokens(id,stayId,tokenHash,expiresAt) VALUES(@id,@stayId,@tokenHash,@expiresAt)",
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
      "UPDATE Stays SET dnd=@dnd WHERE id=@stayId AND status='OPEN'",
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
    const user = await one(tx, "SELECT * FROM Users WHERE id=@id", {
      id: actor.id,
    });
    assert(
      await bcrypt.compare(b.current, user.passwordHash),
      "Mật khẩu hiện tại không đúng",
      400,
    );
    await query(
      tx,
      "UPDATE Users SET passwordHash=@passwordHash,authVersion=authVersion+1 WHERE id=@id",
      { id: actor.id, passwordHash: await bcrypt.hash(b.password, 12) },
    );
    await query(tx, "UPDATE RefreshSessions SET revoked=1 WHERE userId=@id", {
      id: actor.id,
    });
    return { ok: true };
  }
  if (action === "logout") {
    await staff(tx, actor, ["Admin", "Receptionist", "Cleaner"]);
    await query(tx, "UPDATE Users SET authVersion=authVersion+1 WHERE id=@id", {
      id: actor.id,
    });
    await query(tx, "UPDATE RefreshSessions SET revoked=1 WHERE userId=@id", {
      id: actor.id,
    });
    await query(tx, "DELETE DeviceTokens WHERE userId=@id", { id: actor.id });
    return { ok: true };
  }
  if (action === "notification-read") {
    const b = z.object({ id: uuid }).parse(raw);
    await query(
      tx,
      "UPDATE Notifications SET isRead=1 WHERE id=@id AND userId=@userId",
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
    await query(tx, "DELETE DeviceTokens WHERE token=@token", {
      token: b.token,
    });
    await query(
      tx,
      "INSERT DeviceTokens(token,userId) VALUES(@token,@userId)",
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
    const r = await one(tx, "SELECT * FROM Receipts WHERE id=@id", {
      id: b.receiptId,
    });
    assert(r, "Không có phiếu thu", 404);
    if (r.stayId)
      assert(
        !(await one(tx, "SELECT id FROM Invoices WHERE stayId=@id", {
          id: r.stayId,
        })),
        "Đã chốt hóa đơn: dùng hoàn tiền kèm điều chỉnh",
      );
    const returned = (
      await one(
        tx,
        "SELECT COALESCE(SUM(amount),0) amount FROM ReceiptReturns WHERE receiptId=@id",
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
      "INSERT ReceiptReturns(id,receiptId,amount,reason,actorId) VALUES(@id,@receiptId,@amount,@reason,@actorId)",
      { ...b, id: rid, actorId: actor.id },
    );
    await audit(tx, actor, action, rid, b);
    return { id: rid };
  }
  if (action === "customer") {
    const b = schema.customer.parse(raw);
    const customerId = b.id || id();
    if (b.id) {
      assert(
        await one(tx, "SELECT id FROM Customers WHERE id=@id", { id: b.id }),
        "Không có khách hàng",
        404,
      );
      await query(
        tx,
        "UPDATE Customers SET name=@name,phone=@phone,notes=@notes WHERE id=@id",
        { ...b, id: customerId },
      );
    } else
      await query(
        tx,
        "INSERT Customers(id,name,phone,notes) VALUES(@id,@name,@phone,@notes)",
        { ...b, id: customerId },
      );
    return { id: customerId };
  }
  if (action === "booking") {
    const b = schema.booking.parse(raw);
    assert(
      new Date(b.endsAt) > new Date(b.startsAt) &&
        new Date(b.startsAt) >= new Date(Date.now() - 60000),
      "Khoảng đặt phòng không hợp lệ",
      400,
    );
    const room = await available(tx, b.roomId, b.startsAt, b.endsAt, b.id);
    assert(b.guests <= room.capacity, "Vượt sức chứa", 400);
    const bookingId = b.id || id();
    if (b.id) {
      const old = await one(tx, "SELECT * FROM Bookings WHERE id=@id", {
        id: b.id,
      });
      assert(old?.status === "CONFIRMED", "Không thể sửa đặt phòng");
      assert(b.deposit === 0, "Thu thêm cọc qua phiếu thu", 400);
      await query(
        tx,
        "UPDATE Bookings SET roomId=@roomId,customerId=@customerId,startsAt=@startsAt,endsAt=@endsAt,guests=@guests,mode=@mode WHERE id=@id",
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
        "INSERT Bookings(id,roomId,customerId,startsAt,endsAt,guests,mode,status) VALUES(@id,@roomId,@customerId,@startsAt,@endsAt,@guests,@mode,'CONFIRMED')",
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
      "UPDATE Bookings SET source=@source,campaignId=@campaignId WHERE id=@id",
      { ...b, id: bookingId },
    );
    await audit(tx, actor, action, bookingId);
    return { id: bookingId };
  }
  if (action === "booking-cancel") {
    const b = z.object({ id: uuid }).parse(raw);
    const booking = await one(tx, "SELECT * FROM Bookings WHERE id=@id", {
      id: b.id,
    });
    assert(booking?.status === "CONFIRMED", "Đặt phòng không thể hủy");
    const deposit = await one(
      tx,
      "SELECT COALESCE(SUM(r.amount-COALESCE(rr.amount,0)),0) amount FROM Receipts r OUTER APPLY(SELECT SUM(amount) amount FROM ReceiptReturns WHERE receiptId=r.id)rr WHERE r.bookingId=@id",
      { id: b.id },
    );
    assert(!deposit?.amount, "Đặt phòng có cọc: Admin hoàn cọc trước khi hủy");
    await query(tx, "UPDATE Bookings SET status='CANCELLED' WHERE id=@id", b);
    await audit(tx, actor, action, b.id);
    return { ok: true };
  }
  if (action === "checkin") {
    let b = schema.checkin.parse(raw);
    const at = new Date();
    if (b.bookingId) {
      const booking = await one(tx, "SELECT * FROM Bookings WHERE id=@id", {
        id: b.bookingId,
      });
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
        expectedEnd: new Date(booking.endsAt).toISOString(),
      };
    }
    assert(
      new Date(b.expectedEnd) > at,
      "Giờ trả dự kiến phải trong tương lai",
      400,
    );
    const room = await available(tx, b.roomId, at, b.expectedEnd, b.bookingId);
    assert(room.cleanState === "CLEAN", "Phòng cần được dọn và xác nhận sạch");
    assert(b.guests <= room.capacity, "Vượt sức chứa", 400);
    const stayId = id();
    await query(tx, "UPDATE Rooms SET cycle=cycle+1 WHERE id=@id", {
      id: b.roomId,
    });
    await query(
      tx,
      "INSERT Stays(id,roomId,customerId,bookingId,startedAt,expectedEnd,status,guests,mode,rateJson,cycle) VALUES(@id,@roomId,@customerId,@bookingId,@startedAt,@expectedEnd,'OPEN',@guests,@mode,@rateJson,@cycle)",
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
        "UPDATE Bookings SET status='CHECKED_IN' WHERE id=@bookingId",
        b,
      );
      await query(
        tx,
        "UPDATE Receipts SET stayId=@stayId WHERE bookingId=@bookingId",
        { stayId, bookingId: b.bookingId },
      );
      await query(
        tx,
        "UPDATE s SET source=b.source,campaignId=b.campaignId FROM Stays s JOIN Bookings b ON b.id=s.bookingId WHERE s.id=@id",
        { id: stayId },
      );
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
      await one(tx, "SELECT id FROM Stays WHERE id=@id AND status='OPEN'", {
        id: b.stayId,
      }),
      "Lưu trú đã đóng",
    );
    const service = await one(
      tx,
      "SELECT * FROM Services WHERE id=@id AND enabled=1 AND cleaning=0",
      { id: b.serviceId },
    );
    assert(service, "Dịch vụ không hợp lệ", 400);
    assert(
      service.price * b.quantity <= 1000000000,
      "Giá trị dịch vụ vượt giới hạn",
      400,
    );
    const itemId = b.itemId || id();
    if (b.itemId) {
      const old = await one(
        tx,
        "SELECT * FROM StayServiceItems WHERE id=@id AND stayId=@stayId",
        { id: b.itemId, stayId: b.stayId },
      );
      assert(
        old && !old.taskId && old.serviceId === b.serviceId,
        "Không thể sửa mục dịch vụ",
      );
      await query(
        tx,
        "UPDATE StayServiceItems SET quantity=@quantity WHERE id=@id",
        { id: itemId, quantity: b.quantity },
      );
    } else
      await query(
        tx,
        "INSERT StayServiceItems(id,stayId,serviceId,name,unitPrice,quantity) VALUES(@id,@stayId,@serviceId,@name,@unitPrice,@quantity)",
        { ...b, id: itemId, name: service.name, unitPrice: service.price },
      );
    return { id: itemId };
  }
  if (action === "checkout") {
    const b = schema.checkout.parse(raw);
    assert(
      actor.role === "Admin" || (!b.discount && !b.surcharge && !b.allowDebt),
      "Điều chỉnh hoặc cho nợ cần Admin",
      403,
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
    b.discount += voucher?.amount || 0;
    const total = q.total + b.surcharge - b.discount;
    assert(
      Number.isSafeInteger(total) && total <= 1000000000,
      "Tổng hóa đơn vượt giới hạn",
      400,
    );
    assert(
      q.paid <= total,
      "Tiền thu vượt hóa đơn: cần xử lý tiền thừa trước khi chốt",
    );
    assert(
      q.paid >= total || (b.allowDebt && b.reason.trim().length >= 5),
      "Cần thu đủ tiền hoặc Admin xác nhận công nợ có lý do",
    );
    const activeTask = await one(
      tx,
      "SELECT id FROM HousekeepingTasks WHERE stayId=@id AND status IN ('IN_PROGRESS','AWAITING_VERIFICATION')",
      { id: b.stayId },
    );
    assert(
      !activeTask,
      "Cần xử lý công việc đang làm/chờ kiểm tra trước khi trả phòng",
    );
    const invoiceId = id();
    await query(
      tx,
      "INSERT Invoices(id,stayId,total,roomJson,discount,surcharge,debtReason) VALUES(@id,@stayId,@total,@roomJson,@discount,@surcharge,@reason)",
      { ...b, id: invoiceId, total, roomJson: JSON.stringify(q.room) },
    );
    if (voucher)
      await query(
        tx,
        "INSERT VoucherRedemptions(id,voucherId,customerId,invoiceId,amount) VALUES(@id,@voucherId,@customerId,@invoiceId,@amount)",
        {
          id: id(),
          voucherId: voucher.id,
          customerId: q.stay.customerId,
          invoiceId,
          amount: voucher.amount,
        },
      );
    for (const line of [
      { name: "Tiền phòng", quantity: 1, unitPrice: q.room.total },
      ...q.items,
    ])
      await query(
        tx,
        "INSERT InvoiceLines(id,invoiceId,name,quantity,unitPrice,total) VALUES(@id,@invoiceId,@name,@quantity,@unitPrice,@total)",
        {
          id: id(),
          invoiceId,
          name: line.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          total: line.quantity * line.unitPrice,
        },
      );
    for (const r of await query(
      tx,
      "SELECT r.id,r.amount-COALESCE(rr.amount,0) amount FROM Receipts r OUTER APPLY(SELECT SUM(amount) amount FROM ReceiptReturns WHERE receiptId=r.id)rr WHERE r.stayId=@stayId",
      { stayId: b.stayId },
    ))
      if (r.amount > 0)
        await query(
          tx,
          "INSERT PaymentAllocations(receiptId,invoiceId,amount) VALUES(@receiptId,@invoiceId,@amount)",
          { receiptId: r.id, invoiceId, amount: r.amount },
        );
    await query(
      tx,
      "UPDATE Stays SET status='CLOSED',endedAt=@end WHERE id=@id",
      { id: b.stayId, end },
    );
    await query(tx, "UPDATE Rooms SET cleanState='DIRTY' WHERE id=@id", {
      id: q.stay.roomId,
    });
    await query(
      tx,
      "UPDATE GuestAccessTokens SET revoked=1 WHERE stayId=@stayId",
      { stayId: b.stayId },
    );
    await query(
      tx,
      "UPDATE CleaningAssignments SET isActive=0,closedAt=@end,status='CANCELLED' WHERE isActive=1 AND taskId IN (SELECT id FROM HousekeepingTasks WHERE stayId=@stayId)",
      { end, stayId: b.stayId },
    );
    await query(
      tx,
      "UPDATE CleaningOffers SET status='REVOKED' WHERE status='PENDING' AND taskId IN(SELECT id FROM HousekeepingTasks WHERE stayId=@stayId)",
      { stayId: b.stayId },
    );
    await query(
      tx,
      "UPDATE HousekeepingTasks SET status='CANCELLED',version=version+1 WHERE stayId=@stayId AND status IN('PENDING','ASSIGNED')",
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
    await audit(tx, actor, action, b.stayId, { invoiceId, total });
    return { id: invoiceId, total };
  }
  if (action === "refund") {
    const b = schema.refund.parse(raw);
    const invoice = await one(tx, "SELECT * FROM Invoices WHERE id=@id", {
      id: b.invoiceId,
    });
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
        `INSERT ${table}(id,invoiceId,amount,reason,actorId) VALUES(@id,@invoiceId,@amount,@reason,@actorId)`,
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
      const old = await one(tx, "SELECT * FROM Users WHERE id=@id", {
        id: b.id,
      });
      assert(old, "Không tìm thấy tài khoản", 404);
      if (old.role !== b.role)
        assert(
          !(await one(
            tx,
            "SELECT id FROM CleaningAssignments WHERE cleanerId=@id AND isActive=1",
            { id: b.id },
          )),
          "Nhân viên có việc đang hoạt động",
        );
      await query(
        tx,
        "UPDATE Users SET name=@name,role=@role,enabled=@enabled,authVersion=authVersion+1 WHERE id=@id",
        { ...b, id: userId },
      );
      if (b.password)
        await query(
          tx,
          "UPDATE Users SET passwordHash=@passwordHash WHERE id=@id",
          { id: userId, passwordHash: await bcrypt.hash(b.password, 12) },
        );
      await query(tx, "UPDATE RefreshSessions SET revoked=1 WHERE userId=@id", {
        id: userId,
      });
    } else {
      assert(b.password, "Cần mật khẩu cho tài khoản mới", 400);
      await query(
        tx,
        "INSERT Users(id,username,name,role,enabled,passwordHash) VALUES(@id,@username,@name,@role,@enabled,@passwordHash)",
        { ...b, id: userId, passwordHash: await bcrypt.hash(b.password, 12) },
      );
    }
    await audit(tx, actor, action, userId, {
      role: b.role,
      enabled: b.enabled,
    });
    return { id: userId };
  }
  if (action === "roomType") {
    const b = schema.roomType.parse(raw);
    const typeId = b.id || id();
    if (b.id)
      await query(
        tx,
        "UPDATE RoomTypes SET name=@name,capacity=@capacity,rateJson=@rateJson WHERE id=@id",
        { ...b, id: typeId, rateJson: JSON.stringify(b.rate) },
      );
    else
      await query(
        tx,
        "INSERT RoomTypes(id,name,capacity,rateJson) VALUES(@id,@name,@capacity,@rateJson)",
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
        "UPDATE Rooms SET number=@number,typeId=@typeId,zone=@zone,enabled=@enabled,photoUrl=@photoUrl WHERE id=@id",
        { ...b, id: roomId },
      );
    else
      await query(
        tx,
        "INSERT Rooms(id,number,typeId,zone,enabled,photoUrl) VALUES(@id,@number,@typeId,@zone,@enabled,@photoUrl)",
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
        await one(tx, "SELECT id FROM Services WHERE id=@id AND cleaning=0", {
          id: b.id,
        }),
        "Không sửa dịch vụ dọn phòng",
      );
      await query(
        tx,
        "UPDATE Services SET name=@name,unit=@unit,price=@price,enabled=@enabled WHERE id=@id",
        { ...b, id: serviceId },
      );
    } else
      await query(
        tx,
        "INSERT Services(id,code,name,unit,price,cleaning,fullClean,enabled) VALUES(@id,@code,@name,@unit,@price,@cleaning,@fullClean,@enabled)",
        { ...b, id: serviceId },
      );
    return { id: serviceId };
  }
  if (action === "cleaner") {
    const b = schema.cleaner.parse(raw);
    assert(new Date(b.endsAt) > new Date(b.startsAt), "Ca không hợp lệ", 400);
    assert(
      await one(tx, "SELECT id FROM Users WHERE id=@id AND role='Cleaner'", {
        id: b.userId,
      }),
      "Tài khoản không phải nhân viên dọn phòng",
      400,
    );
    if (
      await one(tx, "SELECT userId FROM CleanerProfiles WHERE userId=@id", {
        id: b.userId,
      })
    )
      await query(
        tx,
        "UPDATE CleanerProfiles SET zone=@zone,skills=@skills WHERE userId=@userId",
        { ...b, skills: JSON.stringify(b.skills) },
      );
    else
      await query(
        tx,
        "INSERT CleanerProfiles(userId,zone,skills) VALUES(@userId,@zone,@skills)",
        { ...b, skills: JSON.stringify(b.skills) },
      );
    await query(
      tx,
      "INSERT CleanerShifts(id,userId,startsAt,endsAt) VALUES(@id,@userId,@startsAt,@endsAt)",
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
      "INSERT Maintenance(id,roomId,startsAt,endsAt,reason) VALUES(@id,@roomId,@startsAt,@endsAt,@reason)",
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
      "UPDATE Maintenance SET resolvedAt=SYSUTCDATETIME() WHERE id=@id",
      b,
    );
    return { ok: true };
  }
  assert(false, "Không có hành động này", 404);
}
async function receipt(tx, actor, b) {
  assert(b.stayId || b.bookingId, "Cần lượt ở hoặc đặt phòng", 400);
  assert(!(b.stayId && b.bookingId), "Chỉ chọn một nguồn thu", 400);
  if (b.bookingId)
    assert(
      await one(
        tx,
        "SELECT id FROM Bookings WHERE id=@id AND status='CONFIRMED'",
        { id: b.bookingId },
      ),
      "Đặt phòng không thể thu cọc",
    );
  let q;
  if (b.stayId) {
    q = await quote(tx, b.stayId);
    assert(b.amount <= q.balance, "Số tiền vượt số dư phải thu", 400);
  }
  const rid = id();
  await query(
    tx,
    "INSERT Receipts(id,bookingId,stayId,amount,method,actorId) VALUES(@id,@bookingId,@stayId,@amount,@method,@actorId)",
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
      "INSERT PaymentAllocations(receiptId,invoiceId,amount) VALUES(@receiptId,@invoiceId,@amount)",
      { receiptId: rid, invoiceId: q.invoice.id, amount: b.amount },
    );
  await audit(tx, actor, "receipt", rid, { amount: b.amount });
  return { id: rid };
}
