import { z } from "zod";
import { one, query } from "../db.js";
import { first, update } from "../mongo-store.js";
import {
  id,
  audit,
  staff,
  guestStay,
  notify,
  notifyDesk,
} from "../repository.js";
import {
  assert,
  timestamp,
  checklists,
  serviceCodes,
  rankCleaners,
} from "../domain.js";
const uuid = z.string().uuid();
const desk = ["Admin", "Receptionist"];
const taskSchema = z.object({
  stayId: uuid,
  serviceCode: z.enum(serviceCodes),
  windowStart: timestamp,
  windowEnd: timestamp,
  entryConsent: z.boolean(),
  feeApproved: z.boolean(),
  notes: z.string().max(1000).default(""),
});
export async function createTask(tx, actor, raw, turnover = false) {
  const b = taskSchema.parse(raw);
  await guestStay(tx, actor, b.stayId);
  const stay = await one(
    tx,
    (p) => ({ collection: "Stays", filter: { id: p.id } }),
    {
      id: b.stayId,
    },
  );
  assert(stay, "Không có lượt lưu trú", 404);
  assert(
    turnover
      ? actor.kind === "staff" && stay.status === "CLOSED"
      : stay.status === "OPEN" && b.serviceCode !== "TURNOVER",
    "Không thể tạo loại việc cho lượt ở này",
  );
  assert(!stay.dnd || turnover, "Khách đang bật Không làm phiền");
  assert(b.entryConsent, "Cần xác nhận cho phép vào phòng", 400);
  const start = new Date(b.windowStart),
    end = new Date(b.windowEnd);
  assert(
    end > start &&
      end > Date.now() &&
      start.getTime() >= Date.now() - 60000 &&
      end.getTime() - Date.now() <= 7 * 86400000,
    "Khung giờ không hợp lệ (tối đa 7 ngày)",
    400,
  );
  const service = await one(
    tx,
    (p) => ({
      collection: "Services",
      filter: {
        $and: [{ code: p.code }, { cleaning: true }, { enabled: true }],
      },
    }),
    { code: b.serviceCode },
  );
  assert(service, "Dịch vụ dọn phòng không hoạt động", 400);
  assert(!service.price || b.feeApproved, "Cần chấp thuận phí", 400);
  if (!turnover)
    assert(
      !(await one(
        tx,
        (p) => ({
          collection: "HousekeepingTasks",
          filter: {
            $and: [
              { stayId: p.stayId },
              { serviceId: p.serviceId },
              { status: { $nin: ["COMPLETED", "CANCELLED"] } },
              { windowStart: { $lt: p.end } },
              { windowEnd: { $gt: p.start } },
            ],
          },
          project: { id: 1 },
        }),
        { stayId: b.stayId, serviceId: service.id, start, end },
      )),
      "Đã có yêu cầu cùng loại trong khung giờ",
    );
  const taskId = id();
  await query(
    tx,
    (p) => ({
      collection: "HousekeepingTasks",
      insert: {
        id: p.id,
        roomId: p.roomId,
        stayId: p.stayId,
        serviceId: p.serviceId,
        source: p.source,
        windowStart: p.start,
        windowEnd: p.end,
        status: "PENDING",
        checklistJson: p.checklistJson,
        priceSnapshot: p.price,
        entryConsent: p.entryConsent,
        notes: p.notes,
        cycle: p.cycle,
        dedupeKey: p.dedupeKey,
      },
    }),
    {
      ...b,
      id: taskId,
      roomId: stay.roomId,
      serviceId: service.id,
      source: turnover ? "CHECKOUT" : actor.kind === "guest" ? "GUEST" : "DESK",
      start,
      end,
      checklistJson: JSON.stringify(checklists[b.serviceCode]),
      price: service.price,
      cycle: stay.cycle,
      dedupeKey: turnover
        ? `turnover:${stay.roomId}:${stay.cycle}`
        : `request:${taskId}`,
    },
  );
  await notifyDesk(
    tx,
    "Yêu cầu dọn phòng mới",
    b.notes || service.name,
    taskId,
    "created:" + taskId,
  );
  await audit(tx, actor, "task.create", taskId, { serviceCode: b.serviceCode });
  return { id: taskId, status: "PENDING" };
}
async function eligible(tx, task) {
  const room = await one(
    tx,
    (p) => ({
      collection: "Rooms",
      filter: { id: p.id },
      project: { zone: 1 },
    }),
    {
      id: task.roomId,
    },
  );
  const service = await one(
    tx,
    (p) => ({
      collection: "Services",
      filter: { id: p.id },
      project: { code: 1 },
    }),
    {
      id: task.serviceId,
    },
  );
  const at = new Date();
  const cleaners = await query(tx, "eligibleCleaners", { at });
  return rankCleaners(
    cleaners.filter((c) => JSON.parse(c.skills).includes(service.code)),
    room.zone,
    at,
  );
}
export async function dispatch(tx) {
  const at = new Date();
  await query(
    tx,
    (p) => ({
      collection: "CleaningOffers",
      filter: { $and: [{ status: "PENDING" }, { expiresAt: { $lte: p.at } }] },
      update: { $set: { status: "EXPIRED" } },
    }),
    { at },
  );
  const tasks = await query(tx, "dispatchTasks", { at });
  for (const task of tasks) {
    if (
      await one(
        tx,
        (p) => ({
          collection: "CleaningOffers",
          filter: { $and: [{ taskId: p.id }, { status: "PENDING" }] },
          project: { id: 1 },
        }),
        { id: task.id },
      )
    )
      continue;
    if (task.offerRound >= 3 || new Date(task.windowEnd) <= at) {
      await query(
        tx,
        (p) => ({
          collection: "HousekeepingTasks",
          filter: { id: p.id },
          update: {
            $set: {
              escalated: true,
              nextDispatchAt: new Date(
                new Date(new Date()).getTime() + 604800000,
              ),
            },
          },
        }),
        { id: task.id },
      );
      await notifyDesk(
        tx,
        "Cần giao việc thủ công",
        "Hết vòng mời hoặc quá khung giờ; chưa có người nhận.",
        task.id,
        "escalated:" + task.id + ":" + task.version,
      );
      continue;
    }
    const candidates = (await eligible(tx, task)).slice(0, 3);
    if (!candidates.length) {
      await query(
        tx,
        (p) => ({
          collection: "HousekeepingTasks",
          filter: { id: p.id },
          update: {
            $set: {
              escalated: true,
              nextDispatchAt: new Date(new Date(new Date()).getTime() + 60000),
            },
          },
        }),
        { id: task.id },
      );
      await notifyDesk(
        tx,
        "Chưa có người phù hợp",
        "Kiểm tra ca làm, kỹ năng và trạng thái nhận việc.",
        task.id,
        "no-cleaner:" + task.id + ":" + task.version,
      );
      continue;
    }
    const round = task.offerRound + 1;
    await query(
      tx,
      (p) => ({
        collection: "HousekeepingTasks",
        filter: { id: p.id },
        update: { $set: { offerRound: p.round, escalated: false } },
      }),
      { id: task.id, round },
    );
    for (const c of candidates) {
      const offerId = id();
      const expiresAt = new Date(
        Math.min(at.getTime() + 60000, new Date(task.windowEnd).getTime()),
      );
      await query(
        tx,
        (p) => ({
          collection: "CleaningOffers",
          insert: {
            id: p.id,
            taskId: p.taskId,
            cleanerId: p.cleanerId,
            round: p.round,
            taskVersion: p.version,
            expiresAt: p.expiresAt,
            status: "PENDING",
            scoreBreakdown: p.breakdown,
          },
        }),
        {
          id: offerId,
          taskId: task.id,
          cleanerId: c.userId,
          round,
          version: task.version,
          expiresAt,
          breakdown: JSON.stringify({ ...c.breakdown, score: c.score }),
        },
      );
      await notify(
        tx,
        c.userId,
        "Có lời mời dọn phòng",
        "Lời mời có hiệu lực 60 giây.",
        task.id,
        "offer:" + offerId,
      );
    }
  }
}
export async function housekeepingAction(tx, actor, action, raw) {
  if (["task-desk-start", "task-desk-complete"].includes(action)) {
    await staff(tx, actor, desk);
    const body = z.object({ taskId: uuid, checklist: z.array(z.string()).max(20).optional(), reason: z.string().max(500).optional() }).parse(raw);
    const task = await one(tx, "taskService", { id: body.taskId });
    assert(task, "Không có công việc", 404);
    const stay = await first(tx, "Stays", { id: task.stayId });
    const room = await first(tx, "Rooms", { id: task.roomId });
    assert(room?.cycle === task.cycle, "Công việc thuộc lượt sử dụng phòng cũ", 409);
    assert(task.source === "CHECKOUT" ? stay?.status === "CLOSED" && !(await first(tx, "Stays", { roomId: task.roomId, status: "OPEN" })) : stay?.status === "OPEN" && !stay.dnd,
      "Lượt lưu trú không cho phép dọn phòng", 409);
    if (task.status === "COMPLETED") return { ok: true };
    if (action === "task-desk-start") {
      assert(["PENDING", "ASSIGNED", "IN_PROGRESS"].includes(task.status), "Công việc không thể bắt đầu", 409);
      assert(task.source === "CHECKOUT" || (new Date() >= new Date(task.windowStart) && new Date() < new Date(task.windowEnd)), "Ngoài khung giờ khách cho phép", 409);
      const active = await first(tx, "CleaningAssignments", { taskId: task.id, isActive: true });
      assert(!active || body.reason?.trim().length >= 5, "Cần lý do tiếp nhận công việc đang giao cho nhân viên", 400);
      if (active) await closeActive(tx, task.id, "REASSIGNED");
      await revoke(tx, task.id);
      await update(tx, "HousekeepingTasks", { id: task.id }, { $set: { status: "IN_PROGRESS", deskStartedBy: actor.id, deskStartedAt: new Date() }, $inc: { version: 1 } });
      if (task.source === "CHECKOUT" && task.fullClean) await update(tx, "Rooms", { id: room.id, cycle: task.cycle }, { $set: { cleanState: "CLEANING" } });
      await audit(tx, actor, action, task.id, { reason: body.reason });
      return { ok: true };
    }
    assert(task.status === "IN_PROGRESS" && task.deskStartedBy, "Cần bắt đầu dọn trực tiếp trước", 409);
    const required = JSON.parse(task.checklistJson);
    assert(required.length === body.checklist?.length && required.every((item) => body.checklist.includes(item)), "Cần hoàn thành toàn bộ checklist", 400);
    await update(tx, "HousekeepingTasks", { id: task.id }, { $set: { status: "AWAITING_VERIFICATION" } });
    return housekeepingAction(tx, actor, "task-verify", { taskId: task.id, passed: true });
  }
  if (action === "task-create") return createTask(tx, actor, raw);
  if (action === "cleaner-availability") {
    await staff(tx, actor, ["Cleaner"]);
    const b = z.object({ accepting: z.boolean() }).parse(raw);
    await query(
      tx,
      (p) => ({
        collection: "CleanerProfiles",
        filter: { userId: p.id },
        update: { $set: { accepting: p.accepting } },
      }),
      { accepting: b.accepting, id: actor.id },
    );
    await query(tx, (p) => ({
      collection: "HousekeepingTasks",
      filter: {
        $and: [
          { status: "PENDING" },
          { offerRound: { $lt: 3 } },
          { windowEnd: { $gt: new Date() } },
        ],
      },
      update: { $set: { escalated: false, nextDispatchAt: new Date() } },
    }));
    return { ok: true };
  }
  if (action === "offer-accept" || action === "offer-reject") {
    await staff(tx, actor, ["Cleaner"]);
    const b = z.object({ offerId: uuid }).parse(raw);
    const offer = await one(
      tx,
      (p) => ({
        collection: "CleaningOffers",
        filter: { $and: [{ id: p.id }, { cleanerId: p.cleanerId }] },
      }),
      { id: b.offerId, cleanerId: actor.id },
    );
    assert(offer, "Không có lời mời", 404);
    if (action === "offer-accept" && offer.status === "ACCEPTED") {
      const assignment = await one(
        tx,
        (p) => ({
          collection: "CleaningAssignments",
          filter: { offerId: p.id },
        }),
        { id: offer.id },
      );
      return { id: assignment.id, taskId: assignment.taskId };
    }
    const task = await one(
      tx,
      (p) => ({ collection: "HousekeepingTasks", filter: { id: p.id } }),
      {
        id: offer.taskId,
      },
    );
    assert(
      offer.status === "PENDING" &&
        new Date(offer.expiresAt) > new Date() &&
        offer.taskVersion === task.version &&
        task.status === "PENDING",
      "Lời mời đã hết hạn hoặc bị thu hồi",
    );
    if (action === "offer-reject") {
      await query(
        tx,
        (p) => ({
          collection: "CleaningOffers",
          filter: { id: p.id },
          update: { $set: { status: "REJECTED" } },
        }),
        { id: offer.id },
      );
      return { ok: true };
    }
    assert(
      (await eligible(tx, task)).some((c) => c.userId === actor.id),
      "Nhân viên đang bận, ngoài ca hoặc không còn phù hợp",
    );
    const stay = await one(
      tx,
      (p) => ({ collection: "Stays", filter: { id: p.id } }),
      {
        id: task.stayId,
      },
    );
    assert(
      (!stay.dnd && stay.status === "OPEN") || task.source === "CHECKOUT",
      "Lượt ở không cho phép thực hiện",
    );
    return assign(tx, actor, task, actor.id, offer.id);
  }
  const b = z
    .object({
      taskId: uuid,
      reason: z.string().max(500).optional(),
      cleanerId: uuid.optional(),
      passed: z.boolean().optional(),
      checklist: z.array(z.string()).max(20).optional(),
      windowStart: timestamp.optional(),
      windowEnd: timestamp.optional(),
      serviceCode: z.enum(serviceCodes).optional(),
      rating: z.number().int().min(1).max(5).optional(),
      comment: z.string().max(500).optional(),
    })
    .parse(raw);
  const task = await one(tx, "taskService", { id: b.taskId });
  assert(task, "Không có công việc", 404);
  if (action === "task-cancel" || action === "task-review")
    await guestStay(tx, actor, task.stayId);
  else if (["task-start", "task-submit"].includes(action))
    await staff(tx, actor, ["Cleaner"]);
  else await staff(tx, actor, desk);
  if (action === "task-cancel") {
    assert(
      ["PENDING", "ASSIGNED"].includes(task.status),
      "Việc đã bắt đầu; cần liên hệ lễ tân xử lý",
    );
    await closeActive(tx, task.id, "CANCELLED");
    await query(
      tx,
      (p) => ({
        collection: "HousekeepingTasks",
        filter: { id: p.id },
        update: { $set: { status: "CANCELLED" }, $inc: { version: 1 } },
      }),
      { id: task.id },
    );
    await revoke(tx, task.id);
    await audit(tx, actor, action, task.id);
    return { ok: true };
  }
  if (action === "task-review") {
    assert(actor.kind === "guest", "Đánh giá dành cho khách", 403);
    assert(
      task.status === "COMPLETED" && b.rating,
      "Công việc chưa hoàn tất hoặc thiếu điểm",
      400,
    );
    assert(
      !(await one(
        tx,
        (p) => ({
          collection: "CleaningReviews",
          filter: { taskId: p.id },
          project: { taskId: 1 },
        }),
        {
          id: task.id,
        },
      )),
      "Đã đánh giá",
    );
    const last = await one(
      tx,
      (p) => ({
        collection: "CleaningAssignments",
        filter: { $and: [{ taskId: p.id }, { status: "SUBMITTED" }] },
        sort: { submittedAt: -1 },
        limit: 1,
      }),
      { id: task.id },
    );
    await query(
      tx,
      (p) => ({
        collection: "CleaningReviews",
        insert: {
          taskId: p.taskId,
          cleanerId: p.cleanerId,
          rating: p.rating,
          comment: p.comment,
        },
      }),
      {
        taskId: task.id,
        cleanerId: last.cleanerId,
        rating: b.rating,
        comment: b.comment || "",
      },
    );
    await query(
      tx,
      (p) => ({
        collection: "CleanerProfiles",
        filter: { userId: p.id },
        update: { $inc: { ratingSum: p.rating, ratingCount: 1 } },
      }),
      { id: last.cleanerId, rating: b.rating },
    );
    return { ok: true };
  }
  if (action === "task-assign") {
    assert(
      task.status === "PENDING" && b.cleanerId,
      "Cần việc đang chờ và nhân viên hợp lệ",
    );
    assert(
      new Date(task.windowStart).getTime() <= Date.now() + 15 * 60000 &&
        new Date(task.windowEnd) > new Date(),
      "Chỉ giao gần khung giờ yêu cầu",
    );
    assert(
      (await eligible(tx, task)).some((c) => c.userId === b.cleanerId),
      "Nhân viên không sẵn sàng",
    );
    return assign(tx, actor, task, b.cleanerId, null);
  }
  if (action === "task-reassign") {
    assert(
      ["PENDING", "ASSIGNED", "IN_PROGRESS"].includes(task.status) &&
        b.reason?.trim().length >= 5,
      "Cần lý do và công việc chưa nộp",
      400,
    );
    await closeActive(tx, task.id, "REASSIGNED");
    await revoke(tx, task.id);
    await query(
      tx,
      (p) => ({
        collection: "HousekeepingTasks",
        filter: { id: p.id },
        update: {
          $set: {
            status: "PENDING",
            offerRound: 0,
            escalated: false,
            nextDispatchAt: new Date(),
          },
          $inc: { version: 1 },
        },
      }),
      { id: task.id },
    );
    await audit(tx, actor, action, task.id, { reason: b.reason });
    return { ok: true };
  }
  if (action === "task-reschedule") {
    assert(
      task.status === "PENDING" && b.windowStart && b.windowEnd,
      "Chỉ đổi lịch việc đang chờ",
    );
    const start = new Date(b.windowStart),
      end = new Date(b.windowEnd);
    assert(
      end > start &&
        start.getTime() >= Date.now() &&
        end.getTime() <= Date.now() + 7 * 86400000,
      "Lịch mới không hợp lệ",
      400,
    );
    const service = await one(
      tx,
      (p) => ({
        collection: "Services",
        filter: {
          $and: [{ code: p.code }, { cleaning: true }, { enabled: true }],
        },
      }),
      { code: b.serviceCode || task.code },
    );
    assert(
      (task.source === "CHECKOUT") === (service?.code === "TURNOVER"),
      "Không thể đổi giữa việc trả phòng và yêu cầu khi đang ở",
      400,
    );
    assert(
      !(await one(
        tx,
        (p) => ({
          collection: "HousekeepingTasks",
          filter: {
            $and: [
              { id: { $ne: p.id } },
              { stayId: p.stayId },
              { serviceId: p.serviceId },
              { status: { $nin: ["COMPLETED", "CANCELLED"] } },
              { windowStart: { $lt: p.end } },
              { windowEnd: { $gt: p.start } },
            ],
          },
          project: { id: 1 },
        }),
        {
          id: task.id,
          stayId: task.stayId,
          serviceId: service?.id,
          start,
          end,
        },
      )),
      "Lịch mới trùng yêu cầu đang có",
    );
    assert(
      service && service.price === task.priceSnapshot,
      "Đổi dịch vụ có phí khác cần hủy và xác nhận lại",
      400,
    );
    await revoke(tx, task.id);
    await query(
      tx,
      (p) => ({
        collection: "HousekeepingTasks",
        filter: { id: p.id },
        update: {
          $set: {
            windowStart: p.start,
            windowEnd: p.end,
            serviceId: p.serviceId,
            checklistJson: p.checklist,
            offerRound: 0,
            escalated: false,
            nextDispatchAt: new Date(),
          },
          $inc: { version: 1 },
        },
      }),
      {
        id: task.id,
        start,
        end,
        serviceId: service.id,
        checklist: JSON.stringify(checklists[service.code]),
      },
    );
    await audit(tx, actor, action, task.id);
    return { ok: true };
  }
  if (action === "task-start" || action === "task-submit") {
    const assignment = await one(
      tx,
      (p) => ({
        collection: "CleaningAssignments",
        filter: {
          $and: [
            { taskId: p.taskId },
            { cleanerId: p.cleanerId },
            { isActive: true },
          ],
        },
      }),
      { taskId: task.id, cleanerId: actor.id },
    );
    assert(
      assignment,
      "Công việc không thuộc nhân viên hoặc không hoạt động",
      403,
    );
    if (action === "task-start") {
      assert(
        new Date() >= new Date(task.windowStart),
        "Chưa đến khung giờ khách cho phép vào phòng",
      );
      assert(
        task.status === "ASSIGNED",
        "Công việc không ở trạng thái được giao",
      );
      const stay = await one(
        tx,
        (p) => ({ collection: "Stays", filter: { id: p.id } }),
        {
          id: task.stayId,
        },
      );
      assert(
        !stay.dnd || task.source === "CHECKOUT",
        "Khách đang bật Không làm phiền",
      );
      await query(
        tx,
        (p) => ({
          collection: "CleaningAssignments",
          filter: { id: p.id },
          update: { $set: { status: "IN_PROGRESS", startedAt: new Date() } },
        }),
        { id: assignment.id },
      );
      await query(
        tx,
        (p) => ({
          collection: "HousekeepingTasks",
          filter: { id: p.id },
          update: { $set: { status: "IN_PROGRESS" }, $inc: { version: 1 } },
        }),
        { id: task.id },
      );
    } else {
      assert(task.status === "IN_PROGRESS", "Chưa bắt đầu công việc");
      const required = JSON.parse(task.checklistJson);
      assert(
        required.length === b.checklist?.length &&
          required.every((i) => b.checklist.includes(i)),
        "Cần hoàn thành toàn bộ checklist",
        400,
      );
      await query(
        tx,
        (p) => ({
          collection: "CleaningAssignments",
          filter: { id: p.id },
          update: {
            $set: {
              status: "SUBMITTED",
              submittedAt: new Date(),
              closedAt: new Date(),
              isActive: false,
              checklistJson: p.checklist,
            },
          },
        }),
        { id: assignment.id, checklist: JSON.stringify(b.checklist) },
      );
      await query(
        tx,
        (p) => ({
          collection: "HousekeepingTasks",
          filter: { id: p.id },
          update: {
            $set: { status: "AWAITING_VERIFICATION" },
            $inc: { version: 1 },
          },
        }),
        { id: task.id },
      );
      await query(
        tx,
        (p) => ({
          collection: "CleanerProfiles",
          filter: { userId: p.id },
          update: { $set: { lastClosedAt: new Date() } },
        }),
        { id: actor.id },
      );
      await notifyDesk(
        tx,
        "Công việc chờ kiểm tra",
        "Nhân viên đã nộp đủ checklist.",
        task.id,
        "submitted:" + assignment.id,
      );
    }
    await audit(tx, actor, action, task.id);
    return { ok: true };
  }
  if (action === "task-verify") {
    assert(
      task.status === "AWAITING_VERIFICATION" && typeof b.passed === "boolean",
      "Không có kết quả cần kiểm tra",
      400,
    );
    assert(
      b.passed || b.reason?.trim().length >= 5,
      "Cần lý do yêu cầu làm lại",
      400,
    );
    if (!b.passed) {
      await query(
        tx,
        (p) => ({
          collection: "CleaningAssignments",
          filter: { $and: [{ taskId: p.id }, { status: "SUBMITTED" }] },
          update: { $set: { status: "REWORK" } },
        }),
        { id: task.id },
      );
      await query(
        tx,
        (p) => ({
          collection: "HousekeepingTasks",
          filter: { id: p.id },
          update: {
            $set: {
              status: "PENDING",
              offerRound: 0,
              escalated: false,
              nextDispatchAt: new Date(),
            },
            $inc: { version: 1 },
          },
        }),
        { id: task.id },
      );
    } else {
      await query(
        tx,
        (p) => ({
          collection: "HousekeepingTasks",
          filter: { id: p.id },
          update: { $set: { status: "COMPLETED", completedBy: actor.id, completedAt: new Date() }, $inc: { version: 1 } },
        }),
        { id: task.id },
      );
      const stay = await one(
        tx,
        (p) => ({ collection: "Stays", filter: { id: p.id } }),
        {
          id: task.stayId,
        },
      );
      // A stale turnover from an earlier occupancy cycle must never clean the new cycle.
      if (task.fullClean)
        await query(tx, "markRoomClean", {
          roomId: task.roomId,
          cycle: task.cycle,
          source: task.source,
        });
      if (task.priceSnapshot) {
        assert(stay.status === "OPEN", "Không thể ghi phí vào lưu trú đã đóng");
        await query(
          tx,
          (p) => ({
            collection: "StayServiceItems",
            insert: {
              id: p.id,
              stayId: p.stayId,
              serviceId: p.serviceId,
              name: p.name,
              unitPrice: p.price,
              quantity: 1,
              taskId: p.taskId,
            },
          }),
          {
            id: id(),
            stayId: task.stayId,
            serviceId: task.serviceId,
            name: checklists[task.code][0],
            price: task.priceSnapshot,
            taskId: task.id,
          },
        );
      }
    }
    await audit(tx, actor, action, task.id, {
      passed: b.passed,
      reason: b.reason,
    });
    return { ok: true };
  }
  assert(false, "Hành động dọn phòng không hợp lệ", 404);
}
async function assign(tx, actor, task, cleanerId, offerId) {
  const stay = await one(
    tx,
    (p) => ({ collection: "Stays", filter: { id: p.id } }),
    {
      id: task.stayId,
    },
  );
  assert(
    task.source === "CHECKOUT"
      ? stay.status === "CLOSED"
      : stay.status === "OPEN" && !stay.dnd,
    "Lượt ở không cho phép giao việc",
  );
  const assignmentId = id();
  await query(
    tx,
    (p) => ({
      collection: "CleaningAssignments",
      insert: {
        id: p.id,
        taskId: p.taskId,
        cleanerId: p.cleanerId,
        offerId: p.offerId,
        status: "ASSIGNED",
        isActive: true,
      },
    }),
    { id: assignmentId, taskId: task.id, cleanerId, offerId },
  );
  await query(
    tx,
    (p) => ({
      collection: "HousekeepingTasks",
      filter: { id: p.id },
      update: { $set: { status: "ASSIGNED" }, $inc: { version: 1 } },
    }),
    { id: task.id },
  );
  await revoke(tx, task.id);
  if (offerId)
    await query(
      tx,
      (p) => ({
        collection: "CleaningOffers",
        filter: { id: p.id },
        update: { $set: { status: "ACCEPTED" } },
      }),
      { id: offerId },
    );
  await notifyDesk(
    tx,
    "Đã có người nhận việc",
    "Nhân viên đã nhận công việc.",
    task.id,
    "assigned:" + assignmentId,
  );
  await audit(tx, actor, "task.assign", task.id, { cleanerId, assignmentId });
  return { id: assignmentId, taskId: task.id };
}
async function revoke(tx, taskId) {
  await query(
    tx,
    (p) => ({
      collection: "CleaningOffers",
      filter: { $and: [{ taskId: p.taskId }, { status: "PENDING" }] },
      update: { $set: { status: "REVOKED" } },
    }),
    { taskId },
  );
}
async function closeActive(tx, taskId, status) {
  await query(tx, "closeCleanerActivity", { taskId });
  await query(
    tx,
    (p) => ({
      collection: "CleaningAssignments",
      filter: { $and: [{ taskId: p.taskId }, { isActive: true }] },
      update: {
        $set: { isActive: false, closedAt: new Date(), status: p.status },
      },
    }),
    { taskId, status },
  );
}
