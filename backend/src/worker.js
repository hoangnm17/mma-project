import { transaction, query, database } from "./db.js";
import { dispatch } from "./services/housekeeping.js";
import { notifyDesk } from "./repository.js";
export async function tick(io) {
  await transaction(async (tx) => {
    await dispatch(tx);
    for (const b of await query(tx, "arrivalReminders"))
      await notifyDesk(
        tx,
        "Khách sắp đến",
        "Phòng " + b.number + " có lịch nhận trong 24 giờ.",
        null,
        "arrival:" + b.id + ":" + new Date(b.startsAt).toISOString(),
      );
    for (const s of await query(tx, "departureReminders")) {
      const overdue = new Date(s.expectedEnd) < new Date();
      await notifyDesk(
        tx,
        overdue ? "Lưu trú quá giờ" : "Khách sắp trả phòng",
        "Phòng " +
          s.number +
          ". Xác minh với khách, không tự kết thúc lưu trú.",
        null,
        (overdue ? "overdue:" : "departure:") +
          s.id +
          ":" +
          new Date(s.expectedEnd).toISOString(),
      );
    }
  });
  const events = await transaction(async (tx) => {
    await query(tx, (p) => ({
      collection: "OutboxEvents",
      filter: {
        $and: [
          { status: "PROCESSING" },
          { nextAttemptAt: { $lt: new Date() } },
        ],
      },
      update: { $set: { status: "PENDING" } },
    }));
    const rows = await query(tx, (p) => ({
      collection: "OutboxEvents",
      filter: {
        $and: [{ status: "PENDING" }, { nextAttemptAt: { $lte: new Date() } }],
      },
      sort: { createdAt: 1 },
      limit: 20,
    }));
    for (const e of rows)
      await query(
        tx,
        (p) => ({
          collection: "OutboxEvents",
          filter: { id: p.id },
          update: {
            $set: {
              status: "PROCESSING",
              nextAttemptAt: new Date(new Date(new Date()).getTime() + 120000),
            },
          },
        }),
        { id: e.id },
      );
    return rows;
  });
  for (const event of events) {
    try {
      const payload = JSON.parse(event.payloadJson);
      if (event.eventKey.startsWith("special:")) {
        const user = (await query(await database(), () => ({ collection: "Users", filter: { id: event.userId } })))[0];
        if (!user?.enabled || !(user.role === "Admin" || (user.role === "Receptionist" && user.canAccessSpecialServices))) {
          await transaction(tx => query(tx, () => ({ collection: "OutboxEvents", filter: { id: event.id }, update: { $set: { status: "SENT", lastError: "Suppressed: permission revoked" } } })));
          continue;
        }
      }
      io?.to("user:" + event.userId).emit("changed", payload);
      if (process.env.PUSH_ENABLED === "true") {
        const tokens = await transaction((tx) =>
          query(tx, "activeDeviceTokens", { userId: event.userId }),
        );
        if (tokens.length) {
          const response = await fetch("https://exp.host/--/api/v2/push/send", {
            method: "POST",
            signal: AbortSignal.timeout(10000),
            headers: {
              "Content-Type": "application/json",
              ...(process.env.EXPO_ACCESS_TOKEN
                ? { Authorization: "Bearer " + process.env.EXPO_ACCESS_TOKEN }
                : {}),
            },
            body: JSON.stringify(
              tokens.map((t) => ({
                to: t.token,
                title: payload.title,
                body: payload.body,
                data: { taskId: payload.taskId, eventKey: payload.eventKey },
                sound: "default",
                channelId: "housekeeping",
              })),
            ),
          });
          const body = await response.json();
          if (
            !response.ok ||
            body.errors?.length ||
            body.data?.some((t) => t.status === "error")
          )
            throw Error("Expo Push từ chối một hoặc nhiều thông báo");
        }
      }
      await transaction((tx) =>
        query(
          tx,
          (p) => ({
            collection: "OutboxEvents",
            filter: { id: p.id },
            update: {
              $set: { status: "SENT", lastError: null },
              $inc: { attempts: 1 },
            },
          }),
          { id: event.id },
        ),
      );
    } catch (e) {
      await transaction((tx) =>
        query(
          tx,
          (p) => ({
            collection: "OutboxEvents",
            filter: { id: p.id },
            update: {
              $set: {
                status: "PENDING",
                lastError: p.error,
                nextAttemptAt: p.next,
              },
              $inc: { attempts: 1 },
            },
          }),
          {
            id: event.id,
            error: e.message.slice(0, 500),
            next: new Date(
              Date.now() +
                Math.min(3600000, 1000 * 2 ** Math.min(event.attempts, 12)),
            ),
          },
        ),
      );
    }
  }
}
