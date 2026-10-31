import { z } from "zod";
import { assert, money, timestamp } from "../domain.js";
import { one, query } from "../db.js";
import { id, staff, audit, notifyDesk } from "../repository.js";
export async function crmAction(tx, actor, action, raw) {
  if (action === "incident") {
    await staff(tx, actor, ["Admin", "Receptionist", "Cleaner"]);
    const b = z
      .object({
        roomId: z.string().uuid(),
        description: z.string().min(5).max(500),
      })
      .parse(raw);
    if (actor.role === "Cleaner")
      assert(
        await one(tx, "cleanerRoomAssignment", {
          userId: actor.id,
          roomId: b.roomId,
        }),
        "Chỉ báo sự cố tại phòng đã được giao",
        403,
      );
    const incidentId = id();
    await query(
      tx,
      (p) => ({
        collection: "Incidents",
        insert: {
          id: p.id,
          roomId: p.roomId,
          reportedBy: p.reportedBy,
          description: p.description,
        },
      }),
      { ...b, id: incidentId, reportedBy: actor.id },
    );
    await notifyDesk(
      tx,
      "Báo sự cố phòng",
      b.description,
      null,
      "incident:" + incidentId,
    );
    await audit(tx, actor, action, incidentId);
    return { id: incidentId };
  }
  if (action === "incident-resolve") {
    await staff(tx, actor, ["Admin", "Receptionist"]);
    const b = z
      .object({ id: z.string().uuid(), resolution: z.string().min(5).max(500) })
      .parse(raw);
    await query(
      tx,
      (p) => ({
        collection: "Incidents",
        filter: { id: p.id },
        update: {
          $set: {
            status: "RESOLVED",
            resolution: p.resolution,
            resolvedAt: new Date(),
          },
        },
      }),
      b,
    );
    await audit(tx, actor, action, b.id, b);
    return { ok: true };
  }
  await staff(tx, actor, ["Admin"]);
  if (action === "campaign") {
    const b = z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(3).max(120),
        channel: z.string().min(2).max(80),
        startsAt: timestamp,
        endsAt: timestamp,
        budget: money,
        draft: z.string().max(2000).default(""),
      })
      .parse(raw);
    assert(
      new Date(b.endsAt) > new Date(b.startsAt),
      "Lịch chiến dịch không hợp lệ",
      400,
    );
    const cid = b.id || id();
    if (b.id)
      await query(
        tx,
        (p) => ({
          collection: "Campaigns",
          filter: { id: p.id },
          update: {
            $set: {
              name: p.name,
              channel: p.channel,
              startsAt: p.start,
              endsAt: p.end,
              budget: p.budget,
              draft: p.draft,
            },
          },
        }),
        { ...b, id: cid, start: new Date(b.startsAt), end: new Date(b.endsAt) },
      );
    else
      await query(
        tx,
        (p) => ({
          collection: "Campaigns",
          insert: {
            id: p.id,
            name: p.name,
            channel: p.channel,
            startsAt: p.start,
            endsAt: p.end,
            budget: p.budget,
            draft: p.draft,
          },
        }),
        { ...b, id: cid, start: new Date(b.startsAt), end: new Date(b.endsAt) },
      );
    await audit(tx, actor, action, cid);
    return { id: cid };
  }
  if (action === "voucher") {
    const b = z
      .object({
        id: z.string().uuid().optional(),
        code: z.string().regex(/^[A-Z0-9_-]{3,40}$/),
        discount: money.refine((n) => n > 0),
        minTotal: money,
        startsAt: timestamp,
        endsAt: timestamp,
        maxUses: z.number().int().min(1).max(100000),
        perCustomer: z.number().int().min(1).max(100),
        enabled: z.boolean().default(true),
      })
      .parse(raw);
    assert(
      new Date(b.endsAt) > new Date(b.startsAt),
      "Lịch voucher không hợp lệ",
      400,
    );
    const vid = b.id || id();
    const params = {
      ...b,
      id: vid,
      start: new Date(b.startsAt),
      end: new Date(b.endsAt),
    };
    if (b.id)
      await query(
        tx,
        (p) => ({
          collection: "Vouchers",
          filter: { id: p.id },
          update: {
            $set: {
              discount: p.discount,
              minTotal: p.minTotal,
              startsAt: p.start,
              endsAt: p.end,
              maxUses: p.maxUses,
              perCustomer: p.perCustomer,
              enabled: p.enabled,
            },
          },
        }),
        params,
      );
    else
      await query(
        tx,
        (p) => ({
          collection: "Vouchers",
          insert: {
            id: p.id,
            code: p.code,
            discount: p.discount,
            minTotal: p.minTotal,
            startsAt: p.start,
            endsAt: p.end,
            maxUses: p.maxUses,
            perCustomer: p.perCustomer,
            enabled: p.enabled,
          },
        }),
        params,
      );
    await audit(tx, actor, action, vid);
    return { id: vid };
  }
  if (action === "membership") {
    const b = z
      .object({
        customerId: z.string().uuid(),
        tier: z.enum(["STANDARD", "SILVER", "GOLD"]),
      })
      .parse(raw);
    await query(
      tx,
      (p) => ({
        collection: "Customers",
        filter: { id: p.customerId },
        update: { $set: { tier: p.tier } },
      }),
      b,
    );
    await audit(tx, actor, action, b.customerId, b);
    return { ok: true };
  }
  assert(false, "Hành động không hợp lệ", 404);
}
export async function voucherDiscount(tx, code, customerId, total) {
  if (!code) return null;
  const voucher = await one(
    tx,
    (p) => ({
      collection: "Vouchers",
      filter: {
        $and: [
          { code: p.code },
          { enabled: true },
          { startsAt: { $lte: new Date() } },
          { endsAt: { $gt: new Date() } },
        ],
      },
    }),
    { code },
  );
  assert(
    voucher && total >= voucher.minTotal,
    "Voucher hết hạn hoặc chưa đủ giá trị hóa đơn",
    400,
  );
  const used = await one(tx, "voucherUsage", { id: voucher.id, customerId });
  assert(
    used.total < voucher.maxUses && (used.customer || 0) < voucher.perCustomer,
    "Voucher đã hết lượt sử dụng",
  );
  return { ...voucher, amount: Math.min(total, voucher.discount) };
}
