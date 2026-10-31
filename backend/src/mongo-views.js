import { find, first, update, sum, count, aggregate } from "./mongo-store.js";
const now = () => new Date();
const after = (ms, at = now()) => new Date(new Date(at).getTime() + ms);
const dayVN = (d) =>
  new Date(new Date(d).getTime() + 7 * 3600000).toISOString().slice(0, 10);
const search = (s = "") =>
  new RegExp(
    s.replace(/^%|%$/g, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "i",
  );
const page = (p, sort) => ({ sort, skip: p.offset || 0, limit: 30 });
async function taskInfo(ctx, task) {
  if (!task) return undefined;
  const service = await first(ctx, "Services", { id: task.serviceId });
  const room = await first(ctx, "Rooms", { id: task.roomId });
  return {
    ...task,
    serviceName: service?.name,
    code: service?.code,
    fullClean: service?.fullClean,
    roomNumber: room?.number,
  };
}
async function stayInfo(ctx, stay) {
  if (!stay) return undefined;
  const room = await first(ctx, "Rooms", { id: stay.roomId });
  const customer = await first(ctx, "Customers", { id: stay.customerId });
  return { ...stay, roomNumber: room?.number, customerName: customer?.name };
}
async function roomInfo(ctx, room) {
  if (!room) return undefined;
  const type = await first(ctx, "RoomTypes", { id: room.typeId });
  return {
    ...room,
    typeName: type?.name,
    capacity: type?.capacity,
    rateJson: type?.rateJson,
  };
}
async function receiptInfo(ctx, filter, extra = {}) {
  const rows = await find(ctx, "Receipts", filter, extra);
  const result = [];
  for (const row of rows)
    result.push({
      ...row,
      returned: await sum(ctx, "ReceiptReturns", { receiptId: row.id }),
    });
  return result;
}
async function netReceipts(ctx, filter) {
  const rows = await receiptInfo(ctx, filter);
  return rows.reduce((n, r) => n + r.amount - r.returned, 0);
}
async function invoiceInfo(ctx, invoice) {
  const stay = await first(ctx, "Stays", { id: invoice.stayId });
  const info = await stayInfo(ctx, stay);
  const adjusted = await sum(ctx, "Adjustments", { invoiceId: invoice.id });
  const refunded = await sum(ctx, "Refunds", { invoiceId: invoice.id });
  const paid = await netReceipts(ctx, { stayId: invoice.stayId });
  const balance = Math.max(0, invoice.total - adjusted - paid + refunded);
  const adjustedBy = invoice.adjustedBy ? await first(ctx, "Users", { id: invoice.adjustedBy }, { project: { name: 1 } }) : null;
  return {
    ...invoice,
    roomNumber: info?.roomNumber,
    customerName: info?.customerName,
    adjusted, refunded, paid, balance,
    originalTotal: invoice.originalTotal ?? invoice.total,
    adjustedByName: adjustedBy?.name || null,
    startedAt: stay?.startedAt, endedAt: stay?.endedAt, mode: stay?.mode,
    paymentStatus: balance === 0 ? "PAID" : paid - refunded > 0 ? "PARTIAL" : "UNPAID",
  };
}
async function cleanerStatus(ctx, userId) {
  return {
    inShift: !!(await first(ctx, "CleanerShifts", {
      userId,
      startsAt: { $lte: now() },
      endsAt: { $gt: now() },
    })),
    busy: !!(await first(ctx, "CleaningAssignments", {
      cleanerId: userId,
      isActive: true,
    })),
  };
}
async function validGuest(ctx, filter) {
  const access = await first(ctx, "GuestAccessTokens", {
    ...filter,
    revoked: false,
    expiresAt: { $gt: now() },
  });
  if (!access) return undefined;
  const stay = await first(ctx, "Stays", { id: access.stayId, status: "OPEN" });
  if (!stay) return undefined;
  const room = await first(ctx, "Rooms", { id: stay.roomId });
  return { ...access, number: room?.number };
}
async function clash(ctx, p) {
  const start = p.startsAt || p.start,
    end = p.endsAt || p.end;
  const booking = await first(ctx, "Bookings", {
    roomId: p.roomId,
    status: "CONFIRMED",
    ...(p.excludeBooking ? { id: { $ne: p.excludeBooking } } : {}),
    startsAt: { $lt: end },
    endsAt: { $gt: start },
  });
  if (booking) return [booking];
  const stay = await first(ctx, "Stays", {
    roomId: p.roomId,
    status: "OPEN",
    $or: [{ expectedEnd: { $gt: start } }, { expectedEnd: { $lte: now() } }],
  });
  if (stay) return [stay];
  const maintenance = await first(ctx, "Maintenance", {
    roomId: p.roomId,
    resolvedAt: null,
    startsAt: { $lt: end },
    endsAt: { $gt: start },
  });
  return maintenance ? [maintenance] : [];
}
async function daily(ctx, collection, dateField, value, extra = []) {
  return aggregate(ctx, collection, [
    ...extra,
    {
      $group: {
        _id: {
          $dateToString: {
            date: "$" + dateField,
            format: "%Y-%m-%d",
            timezone: "+07:00",
          },
        },
        value: { $sum: value },
      },
    },
    { $project: { _id: 0, date: "$_id", value: 1 } },
  ]);
}
export const views = {
  async health(ctx) {
    await ctx.db.command({ ping: 1 });
    return [{ ready: 1 }];
  },
  async validGuest(ctx, p) {
    const row = await validGuest(ctx, { id: p.id });
    return row ? [{ id: row.id }] : [];
  },
  async exchangeGuest(ctx, p) {
    const row = await validGuest(ctx, { tokenHash: p.tokenHash });
    return row ? [row] : [];
  },
  async refreshUser(ctx, p) {
    const session = await first(ctx, "RefreshSessions", {
      tokenHash: p.tokenHash,
      revoked: false,
      expiresAt: { $gt: now() },
    });
    if (!session) return [];
    const user = await first(ctx, "Users", {
      id: session.userId,
      enabled: true,
    });
    return user ? [{ ...user, sessionId: session.id }] : [];
  },
  async guestAccess(ctx, p) {
    const access = await first(ctx, "GuestAccessTokens", { id: p.id });
    if (!access) return [];
    const stay = await first(ctx, "Stays", { id: access.stayId });
    return stay ? [{ ...access, status: stay.status }] : [];
  },
  async guestTasks(ctx, p) {
    const rows = await find(
      ctx,
      "HousekeepingTasks",
      { stayId: p.stayId },
      page(p, { createdAt: -1 }),
    );
    const result = [];
    for (const row of rows) result.push(await taskInfo(ctx, row));
    return result;
  },
  async deskTasks(ctx, p) {
    const rooms = await find(
      ctx,
      "Rooms",
      { number: search(p.search) },
      { project: { id: 1 } },
    );
    const rows = await find(
      ctx,
      "HousekeepingTasks",
      { roomId: p.roomId || { $in: rooms.map((r) => r.id) } },
      page(p, { createdAt: -1 }),
    );
    const result = [];
    for (const row of rows) result.push(await taskInfo(ctx, row));
    return result;
  },
  async cleanerTasks(ctx, p) {
    const rows = await find(
      ctx,
      "CleaningAssignments",
      { cleanerId: p.userId },
      page(p, { assignedAt: -1 }),
    );
    const result = [];
    for (const a of rows) {
      const t = await taskInfo(
        ctx,
        await first(ctx, "HousekeepingTasks", { id: a.taskId }),
      );
      if (t)
        result.push({
          ...t,
          assignmentStatus: a.status,
          isActive: a.isActive,
          assignmentId: a.id,
          assignedAt: a.assignedAt,
          startedAt: a.startedAt,
          submittedAt: a.submittedAt,
          closedAt: a.closedAt,
        });
    }
    return result;
  },
  async offers(ctx, p) {
    const rows = await find(
      ctx,
      "CleaningOffers",
      { cleanerId: p.userId, status: "PENDING", expiresAt: { $gt: now() } },
      { sort: { expiresAt: 1 } },
    );
    const result = [];
    for (const o of rows) {
      const t = await taskInfo(
        ctx,
        await first(ctx, "HousekeepingTasks", { id: o.taskId }),
      );
      if (t)
        result.push({
          ...o,
          serverNow: now(),
          notes: t.notes,
          windowStart: t.windowStart,
          windowEnd: t.windowEnd,
          roomNumber: t.roomNumber,
          serviceName: t.serviceName,
        });
    }
    return result;
  },
  async cleanerStatus(ctx, p) {
    const profile = await first(ctx, "CleanerProfiles", { userId: p.userId });
    return profile
      ? [{ ...profile, ...(await cleanerStatus(ctx, p.userId)) }]
      : [];
  },
  async guestStay(ctx, p) {
    const s = await first(ctx, "Stays", { id: p.stayId });
    if (!s) return [];
    const room = await first(ctx, "Rooms", { id: s.roomId });
    return [{ id: s.id, dnd: s.dnd, status: s.status, number: room?.number }];
  },
  async rooms(ctx, p) {
    const rows = await find(
      ctx,
      "Rooms",
      { number: search(p.search), ...(p.typeId ? { typeId: p.typeId } : {}) },
      { sort: { number: 1 } },
    );
    const result = [];
    for (const r of rows) {
      const stay = await first(ctx, "Stays", { roomId: r.id, status: "OPEN" });
      const maintenance = await first(ctx, "Maintenance", {
        roomId: r.id,
        resolvedAt: null,
        startsAt: { $lte: now() },
        endsAt: { $gt: now() },
      });
      result.push({
        ...(await roomInfo(ctx, r)),
        stayId: stay?.id || null,
        expectedEnd: stay?.expectedEnd || null,
        status: !r.enabled
          ? "DISABLED"
          : maintenance
            ? "MAINTENANCE"
            : stay
              ? "OCCUPIED"
              : r.cleanState !== "CLEAN"
                ? "DIRTY"
                : "READY",
      });
    }
    const filtered = p.status ? result.filter((room) => room.status === p.status) : result;
    return p.all ? filtered : filtered.slice(p.offset || 0, (p.offset || 0) + 30);
  },
  async customerHistory(ctx, p) {
    const rows = await find(
      ctx,
      "Stays",
      { customerId: p.customerId },
      { sort: { startedAt: -1 } },
    );
    const result = [];
    for (const s of rows) {
      const i = await first(ctx, "Invoices", { stayId: s.id });
      result.push({
        ...(await stayInfo(ctx, s)),
        invoiceId: i?.id || null,
        total: i?.total ?? null,
      });
    }
    return result;
  },
  async roomHistory(ctx, p) {
    const rows = await find(
      ctx,
      "Stays",
      { roomId: p.roomId },
      { sort: { startedAt: -1 } },
    );
    const result = [];
    for (const s of rows) result.push(await stayInfo(ctx, s));
    return result;
  },
  async bookings(ctx, p) {
    const rows = await find(ctx, "Bookings", {}, page(p, { startsAt: -1 }));
    const result = [];
    for (const b of rows)
      result.push({
        ...(await stayInfo(ctx, b)),
        deposit: await netReceipts(ctx, { bookingId: b.id }),
      });
    return result;
  },
  async stays(ctx, p) {
    const rows = await find(ctx, "Stays", p.status ? { status: p.status } : {}, page(p, { startedAt: -1 }));
    const result = [];
    for (const s of rows) result.push(await stayInfo(ctx, s));
    return result;
  },
  async invoices(ctx, p) {
    const stays = p.customerId ? await find(ctx, "Stays", { customerId: p.customerId }, { project: { id: 1 } }) : null;
    const rows = await find(ctx, "Invoices", stays ? { stayId: { $in: stays.map((s) => s.id) } } : {}, { sort: { createdAt: -1 } });
    const result = [];
    for (const i of rows) result.push(await invoiceInfo(ctx, i));
    const filtered = p.paymentStatus ? result.filter((invoice) => invoice.paymentStatus === p.paymentStatus) : result;
    return filtered.slice(p.offset || 0, (p.offset || 0) + 30);
  },
  stayReceipts: (ctx, p) =>
    receiptInfo(ctx, { stayId: p.stayId }, { sort: { createdAt: -1 } }),
  bookingReceipts: (ctx, p) => receiptInfo(ctx, { bookingId: p.bookingId }),
  async maintenance(ctx, p) {
    const rows = await find(ctx, "Maintenance", {}, page(p, { startsAt: -1 }));
    const result = [];
    for (const m of rows)
      result.push({
        ...m,
        roomNumber: (await first(ctx, "Rooms", { id: m.roomId }))?.number,
      });
    return result;
  },
  async cleaners(ctx) {
    const rows = await find(
      ctx,
      "Users",
      { role: "Cleaner" },
      { project: { id: 1, name: 1, enabled: 1 }, sort: { name: 1 } },
    );
    const result = [];
    for (const u of rows) {
      const c = await first(ctx, "CleanerProfiles", { userId: u.id });
      result.push({
        ...u,
        zone: c?.zone,
        skills: c?.skills,
        accepting: c?.accepting,
        ...(await cleanerStatus(ctx, u.id)),
      });
    }
    return result;
  },
  async dashboard(ctx) {
    const roomCounts = { READY: 0, OCCUPIED: 0, DIRTY: 0, MAINTENANCE: 0, DISABLED: 0 };
    for (const room of await views.rooms(ctx, { all: true })) roomCounts[room.status]++;
    const debtRows = await aggregate(ctx, "Invoices", [
      {
        $lookup: {
          from: "Adjustments",
          localField: "id",
          foreignField: "invoiceId",
          as: "adjustments",
        },
      },
      {
        $lookup: {
          from: "Refunds",
          localField: "id",
          foreignField: "invoiceId",
          as: "refunds",
        },
      },
      {
        $lookup: {
          from: "Receipts",
          localField: "stayId",
          foreignField: "stayId",
          as: "receipts",
        },
      },
      {
        $lookup: {
          from: "ReceiptReturns",
          localField: "receipts.id",
          foreignField: "receiptId",
          as: "returns",
        },
      },
      {
        $group: {
          _id: null,
          debt: {
            $sum: {
              $add: [
                { $subtract: ["$total", { $sum: "$adjustments.amount" }] },
                { $sum: "$refunds.amount" },
                { $sum: "$returns.amount" },
                { $multiply: [-1, { $sum: "$receipts.amount" }] },
              ],
            },
          },
        },
      },
    ]);
    const start = new Date(dayVN(now()) + "T00:00:00+07:00"),
      end = after(86400000, start);
    return [
      {
        roomCounts,
        occupied: await count(ctx, "Stays", { status: "OPEN" }),
        pending: await count(ctx, "HousekeepingTasks", { status: "PENDING" }),
        verifying: await count(ctx, "HousekeepingTasks", {
          status: "AWAITING_VERIFICATION",
        }),
        revenue:
          (await sum(ctx, "Invoices", {}, "total")) -
          (await sum(ctx, "Adjustments")),
        collected:
          (await sum(ctx, "Receipts")) -
          (await sum(ctx, "Refunds")) -
          (await sum(ctx, "ReceiptReturns")),
        debt: debtRows[0]?.debt || 0,
        arrivals: await count(ctx, "Bookings", {
          status: "CONFIRMED",
          startsAt: { $gte: start, $lt: end },
        }),
        departures: await count(ctx, "Stays", {
          status: "OPEN",
          expectedEnd: { $gte: start, $lt: end },
        }),
      },
    ];
  },
  async incidents(ctx, p) {
    const rows = await find(ctx, "Incidents", {}, page(p, { createdAt: -1 }));
    const result = [];
    for (const row of rows)
      result.push({
        ...row,
        roomNumber: (await first(ctx, "Rooms", { id: row.roomId }))?.number,
      });
    return result;
  },
  async availability(ctx, p) {
    const rooms = await find(
      ctx,
      "Rooms",
      { enabled: true },
      { sort: { number: 1 } },
    );
    const result = [];
    for (const r of rooms)
      if (!(await clash(ctx, { ...p, roomId: r.id })).length)
        result.push(await roomInfo(ctx, r));
    return result;
  },
  async campaigns(ctx) {
    return aggregate(ctx, "Campaigns", [
      {
        $lookup: {
          from: "Stays",
          localField: "id",
          foreignField: "campaignId",
          as: "stays",
        },
      },
      {
        $lookup: {
          from: "Invoices",
          localField: "stays.id",
          foreignField: "stayId",
          as: "invoices",
        },
      },
      {
        $lookup: {
          from: "Adjustments",
          localField: "invoices.id",
          foreignField: "invoiceId",
          as: "adjustments",
        },
      },
      {
        $addFields: {
          attributedRevenue: {
            $subtract: [
              { $sum: "$invoices.total" },
              { $sum: "$adjustments.amount" },
            ],
          },
        },
      },
      { $unset: ["_id", "stays", "invoices", "adjustments"] },
      { $sort: { startsAt: -1, id: 1 } },
    ]);
  },
  async vouchers(ctx) {
    const rows = await find(ctx, "Vouchers", {}, { sort: { code: 1 } });
    const result = [];
    for (const v of rows)
      result.push({
        ...v,
        uses: await count(ctx, "VoucherRedemptions", { voucherId: v.id }),
      });
    return result;
  },
  async roomType(ctx, p) {
    const r = await roomInfo(ctx, await first(ctx, "Rooms", { id: p.roomId }));
    return r ? [r] : [];
  },
  roomClash: clash,
  async cleanerRoomAssignment(ctx, p) {
    const tasks = await find(
      ctx,
      "HousekeepingTasks",
      { roomId: p.roomId },
      { project: { id: 1 } },
    );
    return find(
      ctx,
      "CleaningAssignments",
      { cleanerId: p.userId, taskId: { $in: tasks.map((t) => t.id) } },
      { project: { id: 1 }, limit: 1 },
    );
  },
  async voucherUsage(ctx, p) {
    return [
      {
        total: await count(ctx, "VoucherRedemptions", { voucherId: p.id }),
        customer: await count(ctx, "VoucherRedemptions", {
          voucherId: p.id,
          customerId: p.customerId,
        }),
      },
    ];
  },
  async revenueByDay(ctx) {
    const rows = await daily(ctx, "Invoices", "createdAt", "$total", [
      {
        $match: {
          createdAt: { $lt: new Date(dayVN(now()) + "T00:00:00+07:00") },
        },
      },
    ]);
    return rows.map((r) => ({ date: r.date, revenue: r.value }));
  },
  async demandByDay(ctx) {
    return (await daily(ctx, "Stays", "startedAt", 1)).map((r) => ({
      date: r.date,
      demand: r.value,
    }));
  },
  async adjustmentsByDay(ctx) {
    return (
      await daily(ctx, "Adjustments", "invoice.createdAt", "$amount", [
        {
          $lookup: {
            from: "Invoices",
            localField: "invoiceId",
            foreignField: "id",
            as: "invoice",
          },
        },
        { $unwind: "$invoice" },
      ])
    ).map((r) => ({ date: r.date, amount: r.value }));
  },
  async stayReturns(ctx, p) {
    const receipts = await find(
      ctx,
      "Receipts",
      { stayId: p.stayId },
      { project: { id: 1 } },
    );
    return [
      {
        amount: await sum(ctx, "ReceiptReturns", {
          receiptId: { $in: receipts.map((r) => r.id) },
        }),
      },
    ];
  },
  async bookingDeposit(ctx, p) {
    return [{ amount: await netReceipts(ctx, { bookingId: p.id }) }];
  },
  async copyBookingSource(ctx, p) {
    const s = await first(ctx, "Stays", { id: p.id });
    const b = await first(ctx, "Bookings", { id: s.bookingId });
    await update(
      ctx,
      "Stays",
      { id: p.id },
      { $set: { source: b.source, campaignId: b.campaignId } },
    );
    return [];
  },
  async netStayReceipts(ctx, p) {
    return (await receiptInfo(ctx, { stayId: p.stayId })).map((r) => ({
      id: r.id,
      amount: r.amount - r.returned,
    }));
  },
  async cancelStayAssignments(ctx, p) {
    const tasks = await find(
      ctx,
      "HousekeepingTasks",
      { stayId: p.stayId },
      { project: { id: 1 } },
    );
    return update(
      ctx,
      "CleaningAssignments",
      { isActive: true, taskId: { $in: tasks.map((t) => t.id) } },
      { $set: { isActive: false, closedAt: p.end, status: "CANCELLED" } },
    );
  },
  async revokeStayOffers(ctx, p) {
    const tasks = await find(
      ctx,
      "HousekeepingTasks",
      { stayId: p.stayId },
      { project: { id: 1 } },
    );
    return update(
      ctx,
      "CleaningOffers",
      { status: "PENDING", taskId: { $in: tasks.map((t) => t.id) } },
      { $set: { status: "REVOKED" } },
    );
  },
  async eligibleCleaners(ctx, p) {
    const profiles = await find(ctx, "CleanerProfiles", { accepting: true });
    const result = [];
    for (const c of profiles) {
      const u = await first(ctx, "Users", {
        id: c.userId,
        role: "Cleaner",
        enabled: true,
      });
      if (
        !u ||
        (await first(ctx, "CleaningAssignments", {
          cleanerId: c.userId,
          isActive: true,
        }))
      )
        continue;
      const shift = await first(
        ctx,
        "CleanerShifts",
        { userId: c.userId, startsAt: { $lte: p.at }, endsAt: { $gt: p.at } },
        { sort: { startsAt: 1 } },
      );
      if (!shift) continue;
      const rows = await aggregate(ctx, "CleaningAssignments", [
        {
          $match: {
            cleanerId: c.userId,
            startedAt: { $gte: shift.startsAt },
            closedAt: { $ne: null },
          },
        },
        {
          $group: {
            _id: null,
            total: {
              $sum: {
                $subtract: [
                  { $floor: { $divide: [{ $toLong: "$closedAt" }, 60000] } },
                  { $floor: { $divide: [{ $toLong: "$startedAt" }, 60000] } },
                ],
              },
            },
          },
        },
      ]);
      result.push({ ...c, name: u.name, workMinutes: rows[0]?.total || 0 });
    }
    return result;
  },
  async dispatchTasks(ctx, p) {
    const tasks = await find(ctx, "HousekeepingTasks", {
      status: "PENDING",
      windowStart: { $lte: after(15 * 60000, p.at) },
      nextDispatchAt: { $lte: p.at },
    });
    const result = [];
    for (const t of tasks) {
      const s = await first(ctx, "Stays", { id: t.stayId });
      if (s && (!s.dnd || t.source === "CHECKOUT")) result.push(t);
    }
    return result;
  },
  async taskService(ctx, p) {
    const task = await taskInfo(
      ctx,
      await first(ctx, "HousekeepingTasks", { id: p.id }),
    );
    return task ? [task] : [];
  },
  async markRoomClean(ctx, p) {
    if (
      p.source === "CHECKOUT" &&
      (await first(ctx, "Stays", { roomId: p.roomId, status: "OPEN" }))
    )
      return [];
    return update(
      ctx,
      "Rooms",
      { id: p.roomId, cycle: p.cycle },
      { $set: { cleanState: "CLEAN" } },
    );
  },
  async closeCleanerActivity(ctx, p) {
    const rows = await find(
      ctx,
      "CleaningAssignments",
      { taskId: p.taskId, isActive: true },
      { project: { cleanerId: 1 } },
    );
    return update(
      ctx,
      "CleanerProfiles",
      { userId: { $in: rows.map((r) => r.cleanerId) } },
      { $set: { lastClosedAt: now() } },
    );
  },
  async arrivalReminders(ctx) {
    const rows = await find(ctx, "Bookings", {
      status: "CONFIRMED",
      startsAt: { $gte: now(), $lte: after(24 * 3600000) },
    });
    const result = [];
    for (const b of rows)
      result.push({
        id: b.id,
        startsAt: b.startsAt,
        number: (await first(ctx, "Rooms", { id: b.roomId }))?.number,
      });
    return result;
  },
  async departureReminders(ctx) {
    const rows = await find(ctx, "Stays", {
      status: "OPEN",
      expectedEnd: { $lt: after(2 * 3600000) },
    });
    const result = [];
    for (const s of rows)
      result.push({
        id: s.id,
        expectedEnd: s.expectedEnd,
        number: (await first(ctx, "Rooms", { id: s.roomId }))?.number,
      });
    return result;
  },
  async activeDeviceTokens(ctx, p) {
    return (await first(ctx, "Users", { id: p.userId, enabled: true }))
      ? find(
          ctx,
          "DeviceTokens",
          { userId: p.userId },
          { project: { token: 1 } },
        )
      : [];
  },
  async duplicateNotifications(ctx) {
    return aggregate(ctx, "Notifications", [
      {
        $group: {
          _id: { eventKey: "$eventKey", userId: "$userId" },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
      {
        $project: {
          _id: 0,
          eventKey: "$_id.eventKey",
          userId: "$_id.userId",
          count: 1,
        },
      },
    ]);
  },
};
