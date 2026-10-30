import { transaction, query } from "./db.js";
import { dispatch } from "./services/housekeeping.js";
import { notifyDesk } from "./repository.js";
export async function tick(io) {
  await transaction(async (tx) => {
    await dispatch(tx);
    for (const b of await query(
      tx,
      "SELECT b.id,r.number,b.startsAt FROM Bookings b JOIN Rooms r ON r.id=b.roomId WHERE b.status='CONFIRMED' AND b.startsAt BETWEEN SYSUTCDATETIME() AND DATEADD(hour,24,SYSUTCDATETIME())",
    ))
      await notifyDesk(
        tx,
        "Khách sắp đến",
        "Phòng " + b.number + " có lịch nhận trong 24 giờ.",
        null,
        "arrival:" + b.id + ":" + new Date(b.startsAt).toISOString(),
      );
    for (const s of await query(
      tx,
      "SELECT s.id,r.number,s.expectedEnd FROM Stays s JOIN Rooms r ON r.id=s.roomId WHERE s.status='OPEN' AND s.expectedEnd<DATEADD(hour,2,SYSUTCDATETIME())",
    )) {
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
    await query(
      tx,
      "UPDATE OutboxEvents SET status='PENDING' WHERE status='PROCESSING' AND nextAttemptAt<SYSUTCDATETIME()",
    );
    const rows = await query(
      tx,
      "SELECT TOP 20 * FROM OutboxEvents WHERE status='PENDING' AND nextAttemptAt<=SYSUTCDATETIME() ORDER BY createdAt",
    );
    for (const e of rows)
      await query(
        tx,
        "UPDATE OutboxEvents SET status='PROCESSING',nextAttemptAt=DATEADD(minute,2,SYSUTCDATETIME()) WHERE id=@id",
        { id: e.id },
      );
    return rows;
  });
  for (const event of events) {
    try {
      const payload = JSON.parse(event.payloadJson);
      io?.to("user:" + event.userId).emit("changed", payload);
      if (process.env.PUSH_ENABLED === "true") {
        const tokens = await transaction((tx) =>
          query(
            tx,
            "SELECT d.token FROM DeviceTokens d JOIN Users u ON u.id=d.userId WHERE d.userId=@userId AND u.enabled=1",
            { userId: event.userId },
          ),
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
          "UPDATE OutboxEvents SET status='SENT',attempts=attempts+1,lastError=NULL WHERE id=@id",
          { id: event.id },
        ),
      );
    } catch (e) {
      await transaction((tx) =>
        query(
          tx,
          "UPDATE OutboxEvents SET status='PENDING',attempts=attempts+1,lastError=@error,nextAttemptAt=@next WHERE id=@id",
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
