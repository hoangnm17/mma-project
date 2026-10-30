import { z } from "zod";
import { one, query } from "../db.js";
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
  const stay = await one(tx, "SELECT * FROM Stays WHERE id=@id", {
    id: b.stayId,
  });
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
    "SELECT * FROM Services WHERE code=@code AND cleaning=1 AND enabled=1",
    { code: b.serviceCode },
  );
  assert(service, "Dịch vụ dọn phòng không hoạt động", 400);
  assert(!service.price || b.feeApproved, "Cần chấp thuận phí", 400);
  if (!turnover)
    assert(
      !(await one(
        tx,
        "SELECT id FROM HousekeepingTasks WHERE stayId=@stayId AND serviceId=@serviceId AND status NOT IN ('COMPLETED','CANCELLED') AND windowStart<@end AND windowEnd>@start",
        { stayId: b.stayId, serviceId: service.id, start, end },
      )),
      "Đã có yêu cầu cùng loại trong khung giờ",
    );
  const taskId = id();
  await query(
    tx,
    "INSERT HousekeepingTasks(id,roomId,stayId,serviceId,source,windowStart,windowEnd,status,checklistJson,priceSnapshot,entryConsent,notes,cycle,dedupeKey) VALUES(@id,@roomId,@stayId,@serviceId,@source,@start,@end,'PENDING',@checklistJson,@price,@entryConsent,@notes,@cycle,@dedupeKey)",
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
  const room = await one(tx, "SELECT zone FROM Rooms WHERE id=@id", {
    id: task.roomId,
  });
  const service = await one(tx, "SELECT code FROM Services WHERE id=@id", {
    id: task.serviceId,
  });
  const at = new Date();
  const cleaners = await query(
    tx,
    `SELECT c.*,u.name,COALESCE((SELECT SUM(DATEDIFF(minute,a.startedAt,a.closedAt)) FROM CleaningAssignments a WHERE a.cleanerId=c.userId AND a.startedAt>=(SELECT MIN(s.startsAt) FROM CleanerShifts s WHERE s.userId=c.userId AND s.startsAt<=@at AND s.endsAt>@at)),0) workMinutes
    FROM CleanerProfiles c JOIN Users u ON u.id=c.userId WHERE u.enabled=1 AND u.role='Cleaner' AND c.accepting=1
    AND EXISTS(SELECT 1 FROM CleanerShifts s WHERE s.userId=c.userId AND s.startsAt<=@at AND s.endsAt>@at)
    AND NOT EXISTS(SELECT 1 FROM CleaningAssignments a WHERE a.cleanerId=c.userId AND a.isActive=1)`,
    { at },
  );
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
    "UPDATE CleaningOffers SET status='EXPIRED' WHERE status='PENDING' AND expiresAt<=@at",
    { at },
  );
  const tasks = await query(
    tx,
    "SELECT t.* FROM HousekeepingTasks t JOIN Stays s ON s.id=t.stayId WHERE t.status='PENDING' AND t.windowStart<=DATEADD(minute,15,@at) AND t.nextDispatchAt<=@at AND (s.dnd=0 OR t.source='CHECKOUT')",
    { at },
  );
  for (const task of tasks) {
    if (
      await one(
        tx,
        "SELECT id FROM CleaningOffers WHERE taskId=@id AND status='PENDING'",
        { id: task.id },
      )
    )
      continue;
    if (task.offerRound >= 3 || new Date(task.windowEnd) <= at) {
      await query(
        tx,
        "UPDATE HousekeepingTasks SET escalated=1,nextDispatchAt=DATEADD(day,7,SYSUTCDATETIME()) WHERE id=@id",
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
        "UPDATE HousekeepingTasks SET escalated=1,nextDispatchAt=DATEADD(second,60,SYSUTCDATETIME()) WHERE id=@id",
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
      "UPDATE HousekeepingTasks SET offerRound=@round,escalated=0 WHERE id=@id",
      { id: task.id, round },
    );
    for (const c of candidates) {
      const offerId = id();
      const expiresAt = new Date(
        Math.min(at.getTime() + 60000, new Date(task.windowEnd).getTime()),
      );
      await query(
        tx,
        "INSERT CleaningOffers(id,taskId,cleanerId,round,taskVersion,expiresAt,status,scoreBreakdown) VALUES(@id,@taskId,@cleanerId,@round,@version,@expiresAt,'PENDING',@breakdown)",
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
  if (action === "task-create") return createTask(tx, actor, raw);
  if (action === "cleaner-availability") {
    await staff(tx, actor, ["Cleaner"]);
    const b = z.object({ accepting: z.boolean() }).parse(raw);
    await query(
      tx,
      "UPDATE CleanerProfiles SET accepting=@accepting WHERE userId=@id",
      { accepting: b.accepting, id: actor.id },
    );
    await query(
      tx,
      "UPDATE HousekeepingTasks SET escalated=0,nextDispatchAt=SYSUTCDATETIME() WHERE status='PENDING' AND offerRound<3 AND windowEnd>SYSUTCDATETIME()",
    );
    return { ok: true };
  }
  if (action === "offer-accept" || action === "offer-reject") {
    await staff(tx, actor, ["Cleaner"]);
    const b = z.object({ offerId: uuid }).parse(raw);
    const offer = await one(
      tx,
      "SELECT * FROM CleaningOffers WHERE id=@id AND cleanerId=@cleanerId",
      { id: b.offerId, cleanerId: actor.id },
    );
    assert(offer, "Không có lời mời", 404);
    if (action === "offer-accept" && offer.status === "ACCEPTED") {
      const assignment = await one(
        tx,
        "SELECT * FROM CleaningAssignments WHERE offerId=@id",
        { id: offer.id },
      );
      return { id: assignment.id, taskId: assignment.taskId };
    }
    const task = await one(tx, "SELECT * FROM HousekeepingTasks WHERE id=@id", {
      id: offer.taskId,
    });
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
        "UPDATE CleaningOffers SET status='REJECTED' WHERE id=@id",
        { id: offer.id },
      );
      return { ok: true };
    }
    assert(
      (await eligible(tx, task)).some((c) => c.userId === actor.id),
      "Nhân viên đang bận, ngoài ca hoặc không còn phù hợp",
    );
    const stay = await one(tx, "SELECT * FROM Stays WHERE id=@id", {
      id: task.stayId,
    });
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
  const task = await one(
    tx,
    "SELECT t.*,s.code,s.fullClean FROM HousekeepingTasks t JOIN Services s ON s.id=t.serviceId WHERE t.id=@id",
    { id: b.taskId },
  );
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
      "UPDATE HousekeepingTasks SET status='CANCELLED',version=version+1 WHERE id=@id",
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
      !(await one(tx, "SELECT taskId FROM CleaningReviews WHERE taskId=@id", {
        id: task.id,
      })),
      "Đã đánh giá",
    );
    const last = await one(
      tx,
      "SELECT TOP 1 * FROM CleaningAssignments WHERE taskId=@id AND status='SUBMITTED' ORDER BY submittedAt DESC",
      { id: task.id },
    );
    await query(
      tx,
      "INSERT CleaningReviews(taskId,cleanerId,rating,comment) VALUES(@taskId,@cleanerId,@rating,@comment)",
      {
        taskId: task.id,
        cleanerId: last.cleanerId,
        rating: b.rating,
        comment: b.comment || "",
      },
    );
    await query(
      tx,
      "UPDATE CleanerProfiles SET ratingSum=ratingSum+@rating,ratingCount=ratingCount+1 WHERE userId=@id",
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
      "UPDATE HousekeepingTasks SET status='PENDING',version=version+1,offerRound=0,escalated=0,nextDispatchAt=SYSUTCDATETIME() WHERE id=@id",
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
      "SELECT * FROM Services WHERE code=@code AND cleaning=1 AND enabled=1",
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
        "SELECT id FROM HousekeepingTasks WHERE id<>@id AND stayId=@stayId AND serviceId=@serviceId AND status NOT IN('COMPLETED','CANCELLED') AND windowStart<@end AND windowEnd>@start",
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
      "UPDATE HousekeepingTasks SET windowStart=@start,windowEnd=@end,serviceId=@serviceId,checklistJson=@checklist,version=version+1,offerRound=0,escalated=0,nextDispatchAt=SYSUTCDATETIME() WHERE id=@id",
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
      "SELECT * FROM CleaningAssignments WHERE taskId=@taskId AND cleanerId=@cleanerId AND isActive=1",
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
      const stay = await one(tx, "SELECT * FROM Stays WHERE id=@id", {
        id: task.stayId,
      });
      assert(
        !stay.dnd || task.source === "CHECKOUT",
        "Khách đang bật Không làm phiền",
      );
      await query(
        tx,
        "UPDATE CleaningAssignments SET status='IN_PROGRESS',startedAt=SYSUTCDATETIME() WHERE id=@id",
        { id: assignment.id },
      );
      await query(
        tx,
        "UPDATE HousekeepingTasks SET status='IN_PROGRESS',version=version+1 WHERE id=@id",
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
        "UPDATE CleaningAssignments SET status='SUBMITTED',submittedAt=SYSUTCDATETIME(),closedAt=SYSUTCDATETIME(),isActive=0,checklistJson=@checklist WHERE id=@id",
        { id: assignment.id, checklist: JSON.stringify(b.checklist) },
      );
      await query(
        tx,
        "UPDATE HousekeepingTasks SET status='AWAITING_VERIFICATION',version=version+1 WHERE id=@id",
        { id: task.id },
      );
      await query(
        tx,
        "UPDATE CleanerProfiles SET lastClosedAt=SYSUTCDATETIME() WHERE userId=@id",
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
        "UPDATE CleaningAssignments SET status='REWORK' WHERE taskId=@id AND status='SUBMITTED'",
        { id: task.id },
      );
      await query(
        tx,
        "UPDATE HousekeepingTasks SET status='PENDING',version=version+1,offerRound=0,escalated=0,nextDispatchAt=SYSUTCDATETIME() WHERE id=@id",
        { id: task.id },
      );
    } else {
      await query(
        tx,
        "UPDATE HousekeepingTasks SET status='COMPLETED',version=version+1 WHERE id=@id",
        { id: task.id },
      );
      const stay = await one(tx, "SELECT * FROM Stays WHERE id=@id", {
        id: task.stayId,
      });
      // A stale turnover from an earlier occupancy cycle must never clean the new cycle.
      if (task.fullClean)
        await query(
          tx,
          "UPDATE Rooms SET cleanState='CLEAN' WHERE id=@roomId AND cycle=@cycle AND (@source<>'CHECKOUT' OR NOT EXISTS(SELECT 1 FROM Stays WHERE roomId=@roomId AND status='OPEN'))",
          { roomId: task.roomId, cycle: task.cycle, source: task.source },
        );
      if (task.priceSnapshot) {
        assert(stay.status === "OPEN", "Không thể ghi phí vào lưu trú đã đóng");
        await query(
          tx,
          "INSERT StayServiceItems(id,stayId,serviceId,name,unitPrice,quantity,taskId) VALUES(@id,@stayId,@serviceId,@name,@price,1,@taskId)",
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
  const stay = await one(tx, "SELECT * FROM Stays WHERE id=@id", {
    id: task.stayId,
  });
  assert(
    task.source === "CHECKOUT"
      ? stay.status === "CLOSED"
      : stay.status === "OPEN" && !stay.dnd,
    "Lượt ở không cho phép giao việc",
  );
  const assignmentId = id();
  await query(
    tx,
    "INSERT CleaningAssignments(id,taskId,cleanerId,offerId,status,isActive) VALUES(@id,@taskId,@cleanerId,@offerId,'ASSIGNED',1)",
    { id: assignmentId, taskId: task.id, cleanerId, offerId },
  );
  await query(
    tx,
    "UPDATE HousekeepingTasks SET status='ASSIGNED',version=version+1 WHERE id=@id",
    { id: task.id },
  );
  await revoke(tx, task.id);
  if (offerId)
    await query(
      tx,
      "UPDATE CleaningOffers SET status='ACCEPTED' WHERE id=@id",
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
    "UPDATE CleaningOffers SET status='REVOKED' WHERE taskId=@taskId AND status='PENDING'",
    { taskId },
  );
}
async function closeActive(tx, taskId, status) {
  await query(
    tx,
    "UPDATE CleanerProfiles SET lastClosedAt=SYSUTCDATETIME() WHERE userId IN(SELECT cleanerId FROM CleaningAssignments WHERE taskId=@taskId AND isActive=1)",
    { taskId },
  );
  await query(
    tx,
    "UPDATE CleaningAssignments SET isActive=0,closedAt=SYSUTCDATETIME(),status=@status WHERE taskId=@taskId AND isActive=1",
    { taskId, status },
  );
}
