import bcrypt from "bcryptjs";
import { transaction, one, query, closeDatabase } from "../src/db.js";
import { id } from "../src/repository.js";
try {
  await transaction(async (tx) => {
    if (await one(tx, "SELECT id FROM Users WHERE role='Admin'")) {
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
      "INSERT Users(id,username,name,passwordHash,role) VALUES(@id,@username,N'Quản lý StayFlow',@passwordHash,'Admin')",
      { id: userId, username, passwordHash: await bcrypt.hash(password, 12) },
    );
    await query(
      tx,
      "INSERT AuditLogs(id,actorId,action,entityId,details) VALUES(@id,@actorId,'user.bootstrap',@entityId,@details)",
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
