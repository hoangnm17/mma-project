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
        await one(
          tx,
          "SELECT a.id FROM CleaningAssignments a JOIN HousekeepingTasks t ON t.id=a.taskId WHERE a.cleanerId=@userId AND t.roomId=@roomId",
          { userId: actor.id, roomId: b.roomId },
        ),
        "Chỉ báo sự cố tại phòng đã được giao",
        403,
      );
    const incidentId = id();
    await query(
      tx,
      "INSERT Incidents(id,roomId,reportedBy,description) VALUES(@id,@roomId,@reportedBy,@description)",
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
      "UPDATE Incidents SET status='RESOLVED',resolution=@resolution,resolvedAt=SYSUTCDATETIME() WHERE id=@id",
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
        "UPDATE Campaigns SET name=@name,channel=@channel,startsAt=@start,endsAt=@end,budget=@budget,draft=@draft WHERE id=@id",
        { ...b, id: cid, start: new Date(b.startsAt), end: new Date(b.endsAt) },
      );
    else
      await query(
        tx,
        "INSERT Campaigns(id,name,channel,startsAt,endsAt,budget,draft) VALUES(@id,@name,@channel,@start,@end,@budget,@draft)",
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
        "UPDATE Vouchers SET discount=@discount,minTotal=@minTotal,startsAt=@start,endsAt=@end,maxUses=@maxUses,perCustomer=@perCustomer,enabled=@enabled WHERE id=@id",
        params,
      );
    else
      await query(
        tx,
        "INSERT Vouchers(id,code,discount,minTotal,startsAt,endsAt,maxUses,perCustomer,enabled) VALUES(@id,@code,@discount,@minTotal,@start,@end,@maxUses,@perCustomer,@enabled)",
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
    await query(tx, "UPDATE Customers SET tier=@tier WHERE id=@customerId", b);
    await audit(tx, actor, action, b.customerId, b);
    return { ok: true };
  }
  assert(false, "Hành động không hợp lệ", 404);
}
export async function voucherDiscount(tx, code, customerId, total) {
  if (!code) return null;
  const voucher = await one(
    tx,
    "SELECT * FROM Vouchers WHERE code=@code AND enabled=1 AND startsAt<=SYSUTCDATETIME() AND endsAt>SYSUTCDATETIME()",
    { code },
  );
  assert(
    voucher && total >= voucher.minTotal,
    "Voucher hết hạn hoặc chưa đủ giá trị hóa đơn",
    400,
  );
  const used = await one(
    tx,
    "SELECT COUNT(*) total,SUM(CASE WHEN customerId=@customerId THEN 1 ELSE 0 END) customer FROM VoucherRedemptions WHERE voucherId=@id",
    { id: voucher.id, customerId },
  );
  assert(
    used.total < voucher.maxUses && (used.customer || 0) < voucher.perCustomer,
    "Voucher đã hết lượt sử dụng",
  );
  return { ...voucher, amount: Math.min(total, voucher.discount) };
}
