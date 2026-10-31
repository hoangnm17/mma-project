import bcrypt from "bcryptjs";
import { transaction, one, query, closeDatabase } from "../src/db.js";
import { id } from "../src/repository.js";
try {
  await transaction(async (tx) => {
    if (
      await one(tx, (p) => ({
        collection: "Users",
        filter: { role: "Admin" },
        project: { id: 1 },
      }))
    ) {
      console.log("Admin đã tồn tại; không đổi mật khẩu/quyền.");
      return;
    }
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD,
      username = process.env.BOOTSTRAP_ADMIN_USERNAME || "admin";
    if (!password || password.length < 12)
      throw Error(
        "Lần triển khai đầu cần BOOTSTRAP_ADMIN_PASSWORD >=12 ký tự.",
      );
    if (!/^[a-zA-Z0-9_.-]{3,80}$/.test(username))
      throw Error("BOOTSTRAP_ADMIN_USERNAME không hợp lệ.");
    const userId = id();
    await query(
      tx,
      (p) => ({
        collection: "Users",
        insert: {
          id: p.id,
          username: p.username,
          name: "Quáº£n lÃ½ StayFlow",
          passwordHash: p.passwordHash,
          role: "Admin",
        },
      }),
      { id: userId, username, passwordHash: await bcrypt.hash(password, 12) },
    );
    await query(
      tx,
      (p) => ({
        collection: "AuditLogs",
        insert: {
          id: p.id,
          actorId: p.actorId,
          action: "user.bootstrap",
          entityId: p.entityId,
          details: p.details,
        },
      }),
      {
        id: id(),
        actorId: userId,
        entityId: userId,
        details: JSON.stringify({ username }),
      },
    );
    console.log(
      "Đã tạo Admin ban đầu. Không seed khách/phòng/tài chính mô phỏng.",
    );
  });
} finally {
  await closeDatabase();
}
