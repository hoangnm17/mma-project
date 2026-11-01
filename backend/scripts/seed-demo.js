import bcrypt from "bcryptjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { transaction, closeDatabase } from "../src/db.js";
import { first, find, insert } from "../src/mongo-store.js";
import { definitions } from "../src/mongo-schema.js";
import { assert, policy } from "../src/domain.js";
import { id, audit } from "../src/repository.js";
import { hotelAction } from "../src/services/hotel.js";
import { createTask } from "../src/services/housekeeping.js";
import { orderAction } from "../src/services/orders.js";

const marker = "demo.seed.v2";

export async function demoSeedState(tx) {
  if (await first(tx, "AuditLogs", { action: marker })) return { seeded: true, eligible: true };
  const allowed = new Set(["Users", "AuditLogs", "RefreshSessions", "Services"]);
  for (const name of Object.keys(definitions).filter(name => !allowed.has(name))) {
    if (await first(tx, name, {})) return { seeded: false, eligible: false, reason: `DB đã có dữ liệu ${name}; chỉ seed DB demo mới hoặc chỉ có Admin bootstrap` };
  }
  if (await first(tx, "Services", { cleaning: { $ne: true } })) return { seeded: false, eligible: false, reason: "DB đã có danh mục dịch vụ; không trộn dữ liệu demo" };
  const users = await find(tx, "Users", {});
  if (users.length && !(users.length === 1 && users[0].role === "Admin" && users[0].enabled))
    return { seeded: false, eligible: false, reason: "DB chỉ được trống hoặc có một Admin bootstrap đang hoạt động" };
  return { seeded: false, eligible: true };
}

// A single transaction makes concurrent/repeated runs safe and rolls back failures.
// Existing business data is never merged, reset or overwritten by this demo tool.
export async function seedDemo(password = process.env.DEMO_SEED_PASSWORD) {
  assert(password?.length >= 10 && password.length <= 100, "Cần DEMO_SEED_PASSWORD từ 10–100 ký tự, chỉ dùng DB demo", 400);
  return transaction(async (tx) => {
    const state = await demoSeedState(tx);
    if (state.seeded) return { skipped: true };
    assert(state.eligible, state.reason, 409);
    const users = await find(tx, "Users", {});
    assert(users.length === 0 || (users.length === 1 && users[0].role === "Admin" && users[0].enabled), "DB chỉ được trống hoặc có một Admin bootstrap đang hoạt động", 409);
    let admin = users[0];
    if (!admin) {
      admin = { id: id(), username: "admin", name: "Quản lý StayFlow", role: "Admin", authVersion: 1 };
      await insert(tx, "Users", { ...admin, passwordHash: await bcrypt.hash(password, 12) });
    }
    const actor = { ...admin, kind: "staff" };
    const hotel = (action, body) => hotelAction(tx, actor, action, body);
    const order = (action, body) => orderAction(tx, actor, action, body);
    for (const [username, name, special] of [["letan", "Lễ tân Minh", false], ["letan_special", "Lễ tân hỗ trợ", true]]) {
      await hotel("user", { username: admin.username === username ? username + "_demo" : username,
        name, role: "Receptionist", password, canAccessSpecialServices: special });
    }

    const types = [];
    for (const [i, name] of ["Tiêu chuẩn", "Đôi", "Gia đình"].entries()) {
      types.push(await hotel("roomType", { name, capacity: 2 + i * 2,
        rate: { ...policy, hour: policy.hour + i * 20000, night: policy.night + i * 80000 } }));
    }
    const rooms = [];
    for (let i = 0; i < 20; i++) {
      rooms.push(await hotel("room", { number: String(101 + Math.floor(i / 5) * 100 + i % 5),
        typeId: types[i % 3].id, zone: "Tầng " + (Math.floor(i / 5) + 1) }));
    }
    // System cleaning catalogue cannot be created through the editable service API.
    for (const [code, name] of [["FULL", "Dọn toàn phòng"], ["TURNOVER", "Dọn sau trả phòng"], ["LINEN", "Thay ga giường"], ["BATHROOM", "Vệ sinh phòng tắm"], ["TOWELS", "Bổ sung khăn"]]) {
      if (!await first(tx, "Services", { code })) await insert(tx, "Services", {
        id: id(), code, name, unit: "Lần", price: 0, cleaning: true, fullClean: ["FULL", "TURNOVER"].includes(code),
      });
    }
    await hotel("service", { code: "WATER", name: "Nước suối", unit: "Chai", price: 10000 });
    await hotel("service", { code: "LAUNDRY", name: "Giặt quần áo", unit: "Kg", price: 30000 });
    const foods = [];
    for (const [code, name, unit, price] of [["FOOD_PORRIDGE", "Cháo thịt", "Tô", 35000], ["FOOD_NOODLES", "Mì trứng", "Tô", 30000], ["FOOD_JUICE", "Nước cam", "Ly", 25000]]) {
      foods.push(await order("food-item", { code, name, unit, price }));
    }
    const specials = [];
    for (const [code, name, purpose, price] of [["SPECIAL_MEAL", "Hỗ trợ bữa ăn", "MEAL_ASSISTANCE", 50000], ["SPECIAL_PRIVATE", "Hỗ trợ cá nhân", "PRIVATE_SUPPORT", 100000]]) {
      specials.push(await order("special-service", { code, name, purpose, unit: "Lượt", price }));
    }

    const customers = [];
    for (const [i, name] of ["Nguyễn Minh Anh", "Trần Hoài Nam", "Lê Thu Hà", "Phạm Đức Huy", "Võ Ngọc Lan", "Bùi Thanh Tâm"].entries()) {
      customers.push(await hotel("customer", { name, phone: "090123450" + i, notes: "Dữ liệu demo" }));
    }
    const stays = [];
    for (let i = 0; i < 3; i++) {
      stays.push(await hotel("checkin", { roomId: rooms[i].id, customerId: customers[i].id, guests: 2, mode: i ? "NIGHT" : "HOUR" }));
    }
    for (let i = 3; i < 6; i++) {
      await hotel("booking", { roomId: rooms[i].id, customerId: customers[i].id, guests: 2, mode: "NIGHT",
        startsAt: new Date(Date.now() + 24 * 3600000).toISOString(), deposit: i === 3 ? 100000 : 0 });
    }
    for (let i = 0; i < 2; i++) {
      await createTask(tx, actor, { stayId: stays[i].id, serviceCode: i ? "TOWELS" : "FULL",
        windowStart: new Date().toISOString(), windowEnd: new Date(Date.now() + 3600000).toISOString(),
        entryConsent: true, feeApproved: true, notes: "Demo dọn trực tiếp tại quầy" });
    }
    await order("food-order", { stayId: stays[0].id, items: [{ serviceId: foods[0].id, quantity: 2 }] });
    const completed = await order("food-order", { stayId: stays[1].id, items: [{ serviceId: foods[1].id, quantity: 1 }] });
    for (const status of ["PREPARING", "COMPLETED"]) await order("food-order-status", { id: completed.id, status });
    await order("special-request", { stayId: stays[2].id, purpose: "MEAL_ASSISTANCE", items: [{ serviceId: specials[0].id, quantity: 1 }] });

    // Give dashboard/manager actual invoice and receipt data through checkout rules.
    const closed = await hotel("checkin", { roomId: rooms[6].id, customerId: customers[0].id, guests: 1, mode: "HOUR" });
    await hotel("checkout", { stayId: closed.id, payRemaining: true, paymentMethod: "CASH" });
    const turnover = await first(tx, "HousekeepingTasks", { stayId: closed.id, source: "CHECKOUT" });
    assert(turnover, "Thiếu task dọn sau checkout", 409);
    const summary = { rooms: 20, roomTypes: 3, customers: 6, openStays: 3, bookings: 3, foodItems: 3,
      specialServices: 2, orders: 3, tasks: 3, invoices: 1, adminPreserved: users.length === 1 };
    await audit(tx, actor, marker, admin.id, summary);
    return { skipped: false, ...summary };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await seedDemo(), null, 2));
  } catch (error) {
    console.error(error.status ? error.message : "Seed thất bại; transaction đã rollback. Kiểm tra Mongo replica set và migration.");
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}
