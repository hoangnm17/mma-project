import bcrypt from "bcryptjs";
import { transaction, query, one, closeDatabase } from "../src/db.js";
import { id } from "../src/repository.js";
import { policy } from "../src/domain.js";
import { createTask } from "../src/services/housekeeping.js";
if (
  !process.env.DEMO_SEED_PASSWORD ||
  process.env.DEMO_SEED_PASSWORD.length < 10
)
  throw Error(
    "Cần DEMO_SEED_PASSWORD ít nhất 10 ký tự, chỉ seed môi trường demo.",
  );
const passwordHash = await bcrypt.hash(process.env.DEMO_SEED_PASSWORD, 12);
await transaction(async (tx) => {
  if (await one(tx, "SELECT id FROM Users WHERE username='admin'")) {
    console.log("Demo đã tồn tại, không thay đổi dữ liệu.");
    return;
  }
  const users = [];
  for (const [username, name, role] of [
    ["admin", "Quản lý StayFlow", "Admin"],
    ["letan", "Lễ tân Minh", "Receptionist"],
    ...["Lan", "Mai", "Hoa", "An", "Bình", "Hương"].map((name, i) => [
      "cleaner" + (i + 1),
      "Dọn phòng " + name,
      "Cleaner",
    ]),
  ]) {
    const user = {
      id: id(),
      username,
      name,
      role,
      authVersion: 1,
      kind: "staff",
    };
    users.push(user);
    await query(
      tx,
      "INSERT Users(id,username,name,role,passwordHash) VALUES(@id,@username,@name,@role,@passwordHash)",
      { ...user, passwordHash },
    );
  }
  const types = [];
  for (const [i, name] of ["Tiêu chuẩn", "Đôi", "Gia đình"].entries()) {
    const type = {
      id: id(),
      name,
      capacity: 2 + i * 2,
      rate: {
        ...policy,
        hour: policy.hour + i * 20000,
        day: policy.day + i * 100000,
        night: policy.night + i * 80000,
      },
    };
    types.push(type);
    await query(
      tx,
      "INSERT RoomTypes(id,name,capacity,rateJson) VALUES(@id,@name,@capacity,@rateJson)",
      { ...type, rateJson: JSON.stringify(type.rate) },
    );
  }
  const rooms = [];
  for (let i = 0; i < 20; i++) {
    const room = {
      id: id(),
      number: String(101 + Math.floor(i / 5) * 100 + (i % 5)),
      typeId: types[i % 3].id,
      zone: "Tầng " + (Math.floor(i / 5) + 1),
    };
    rooms.push(room);
    await query(
      tx,
      "INSERT Rooms(id,number,typeId,zone) VALUES(@id,@number,@typeId,@zone)",
      room,
    );
  }
  for (const [code, name, cleaning, fullClean, price] of [
    ["FULL", "Dọn toàn phòng", 1, 1, 0],
    ["TURNOVER", "Dọn sau trả phòng", 1, 1, 0],
    ["LINEN", "Thay ga giường", 1, 0, 0],
    ["BATHROOM", "Vệ sinh phòng tắm", 1, 0, 0],
    ["TOWELS", "Bổ sung khăn", 1, 0, 0],
    ["WATER", "Nước suối", 0, 0, 10000],
    ["LAUNDRY", "Giặt quần áo", 0, 0, 30000],
  ])
    await query(
      tx,
      "INSERT Services(id,code,name,unit,price,cleaning,fullClean) VALUES(@id,@code,@name,@unit,@price,@cleaning,@fullClean)",
      {
        id: id(),
        code,
        name,
        unit: cleaning ? "Lần" : "Đơn vị",
        price,
        cleaning,
        fullClean,
      },
    );
  for (const [i, user] of users.filter((u) => u.role === "Cleaner").entries()) {
    await query(
      tx,
      "INSERT CleanerProfiles(userId,zone,skills,accepting) VALUES(@userId,@zone,@skills,@accepting)",
      {
        userId: user.id,
        zone: i < 3 ? "Tầng 1" : "Tầng 2",
        skills: JSON.stringify(
          i === 4
            ? ["TOWELS", "LINEN"]
            : ["FULL", "TURNOVER", "LINEN", "BATHROOM", "TOWELS"],
        ),
        accepting: i !== 5,
      },
    );
    await query(
      tx,
      "INSERT CleanerShifts(id,userId,startsAt,endsAt) VALUES(@id,@userId,@start,@end)",
      {
        id: id(),
        userId: user.id,
        start: new Date(Date.now() + (i === 5 ? 86400000 : -3600000)),
        end: new Date(Date.now() + (i === 5 ? 2 * 86400000 : 10 * 3600000)),
      },
    );
  }
  for (let i = 0; i < 6; i++) {
    const customerId = id();
    await query(
      tx,
      "INSERT Customers(id,name,phone) VALUES(@id,@name,@phone)",
      {
        id: customerId,
        name: [
          "Nguyễn Minh Anh",
          "Trần Hoài Nam",
          "Lê Thu Hà",
          "Phạm Đức Huy",
          "Võ Ngọc Lan",
          "Bùi Thanh Tâm",
        ][i],
        phone: "090123450" + i,
      },
    );
    if (i < 3) {
      const stayId = id();
      await query(tx, "UPDATE Rooms SET cycle=1 WHERE id=@id", {
        id: rooms[i].id,
      });
      await query(
        tx,
        "INSERT Stays(id,roomId,customerId,startedAt,expectedEnd,status,guests,mode,rateJson,cycle) VALUES(@id,@roomId,@customerId,@start,@end,'OPEN',2,'DAY',@rateJson,1)",
        {
          id: stayId,
          roomId: rooms[i].id,
          customerId,
          start: new Date(Date.now() - 3600000),
          end: new Date(Date.now() + 20 * 3600000),
          rateJson: JSON.stringify(types[i % 3].rate),
        },
      );
      if (i < 2)
        await createTask(tx, users[0], {
          stayId,
          serviceCode: i ? "TOWELS" : "FULL",
          windowStart: new Date().toISOString(),
          windowEnd: new Date(Date.now() + 3600000).toISOString(),
          entryConsent: true,
          feeApproved: true,
          notes: "Yêu cầu mẫu để demo nhận việc",
        });
    } else
      await query(
        tx,
        "INSERT Bookings(id,roomId,customerId,startsAt,endsAt,status,guests,mode) VALUES(@id,@roomId,@customerId,@start,@end,'CONFIRMED',2,'NIGHT')",
        {
          id: id(),
          roomId: rooms[i].id,
          customerId,
          start: new Date(Date.now() + 86400000),
          end: new Date(Date.now() + 2 * 86400000),
        },
      );
  }
  console.log(
    "Đã seed 20 phòng, 3 loại, 6 Cleaner, 6 khách, 3 stays, 3 bookings và 2 tasks.",
  );
});
await closeDatabase();
