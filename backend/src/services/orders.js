import { z } from "zod";
import { Buffer } from "node:buffer";
import { assert, money } from "../domain.js";
import { id, staff, notify, audit } from "../repository.js";
import { find, first, insert, update } from "../mongo-store.js";

const roles = ["Admin", "Receptionist"];
const statuses = ["PENDING", "PREPARING", "COMPLETED", "CANCELLED"];
const purposes = ["MEAL_ASSISTANCE", "PRIVATE_SUPPORT"];
const resources = {
  "food-items": { kind: "FOOD", catalogue: true },
  "food-orders": { kind: "FOOD", catalogue: false },
  "special-services": { kind: "SPECIAL", catalogue: true },
  "special-requests": { kind: "SPECIAL", catalogue: false },
};
export const orderActions = new Set([
  "food-item",
  "food-order",
  "food-order-status",
  "special-service",
  "special-request",
  "special-request-status",
  "meal-assistant",
  "meal-assistant-delete",
]);

export async function canAccessSpecialServices(tx, actor) {
  if (actor.kind !== "staff" || !roles.includes(actor.role)) return false;
  const user = await first(tx, "Users", { id: actor.id });
  return Boolean(
    user?.enabled &&
      user.authVersion === actor.authVersion &&
      (user.role === "Admin" || user.canAccessSpecialServices === true),
  );
}

async function authorize(tx, actor, kind) {
  await staff(tx, actor, roles);
  if (kind === "SPECIAL")
    assert(
      await canAccessSpecialServices(tx, actor),
      "Bạn chưa được cấp quyền sử dụng dịch vụ hỗ trợ riêng",
      403,
    );
}

async function notifyOrder(tx, kind, order, title) {
  const users = await find(tx, "Users", {
    enabled: true,
    role: { $in: roles },
    ...(kind === "SPECIAL"
      ? { $or: [{ role: "Admin" }, { canAccessSpecialServices: true }] }
      : {}),
  });
  const stay = await first(tx, "Stays", { id: order.stayId });
  const room = stay && (await first(tx, "Rooms", { id: stay.roomId }));
  for (const user of users)
    await notify(
      tx,
      user.id,
      title,
      `Phòng ${room?.number || "—"} · ${order.total.toLocaleString("vi-VN")} VND`,
      null,
      `${kind === "SPECIAL" ? `special:order:${order.specialPurpose}` : "order"}:${order.id}:${order.status}:${user.id}`,
    );
}

export async function readOrdersResource(tx, actor, resource, params = {}) {
  if (resource === "meal-assistants") {
    await authorize(tx, actor, "SPECIAL");
    const page = z.coerce.number().int().min(1).max(10000).parse(params.page || 1);
    return find(tx, "MealAssistants", {
      deleted: false,
      ...(params.status ? { status: z.enum(["AVAILABLE", "SERVING"]).parse(params.status) } : {}),
    }, { sort: { name: 1 }, skip: (page - 1) * 30, limit: 30 });
  }
  const spec = resources[resource];
  if (!spec) return undefined;
  await authorize(tx, actor, spec.kind);
  const specialPurpose =
    spec.kind === "SPECIAL"
      ? z.enum(purposes).parse(params.purpose || "MEAL_ASSISTANCE")
      : null;
  if (spec.catalogue) {
    // Only administrators can see disabled catalogue entries for editing.
    return find(
      tx,
      "Services",
      {
        category: spec.kind,
        ...(specialPurpose ? { specialPurpose } : {}),
        ...(actor.role === "Admin" ? {} : { enabled: true }),
      },
      { sort: { name: 1 }, limit: 200 },
    );
  }
  const page = z.coerce.number().int().min(1).max(10000).parse(params.page || 1);
  const filter = { kind: spec.kind };
  if (specialPurpose) filter.specialPurpose = specialPurpose;
  if (params.stayId) filter.stayId = z.string().uuid().parse(params.stayId);
  if (params.status) filter.status = z.enum(statuses).parse(params.status);
  const orders = await find(tx, "Orders", filter, {
    sort: { requestedAt: -1 },
    skip: (page - 1) * 30,
    limit: 30,
  });
  const stays = await find(tx, "Stays", {
    id: { $in: [...new Set(orders.map((o) => o.stayId))] },
  });
  const rooms = await find(tx, "Rooms", {
    id: { $in: [...new Set(stays.map((s) => s.roomId))] },
  });
  const roomById = new Map(rooms.map((room) => [room.id, room.number]));
  const stayById = new Map(stays.map((stay) => [stay.id, stay]));
  return orders.map((order) => ({
    ...order,
    items: JSON.parse(order.itemsJson),
    roomNumber: roomById.get(stayById.get(order.stayId)?.roomId) || "—",
  }));
}

export async function orderAction(tx, actor, action, raw) {
  assert(orderActions.has(action), "Thao tác không hợp lệ", 400);
  if (action.startsWith("meal-assistant")) {
    await authorize(tx, actor, "SPECIAL");
    await staff(tx, actor, ["Admin"]);
    const { id: existingId } = z.object({
      id: action === "meal-assistant-delete" ? z.string().uuid() : z.string().uuid().optional(),
    }).parse(raw);
    const assistantId = existingId || id();
    const old = await first(tx, "MealAssistants", { id: assistantId, deleted: false });
    assert(!existingId || old, "Không tìm thấy người bón thức ăn", 404);
    const active = old && await first(tx, "Orders", {
      mealAssistantId: old.id, status: { $in: ["PENDING", "PREPARING"] },
    });
    if (action === "meal-assistant-delete") {
      assert(old, "Không tìm thấy người bón thức ăn", 404);
      assert(!active && old.status !== "SERVING", "Không thể xóa người đang phục vụ", 409);
      await update(tx, "MealAssistants", { id: old.id }, { $set: { deleted: true, updatedAt: new Date() } });
    } else {
      const body = z.object({
        name: z.string().trim().min(2).max(120),
        birthYear: z.number().int().min(1900).max(new Date().getUTCFullYear()),
        height: z.number().int().min(50).max(250),
        bust: z.number().int().min(20).max(250),
        waist: z.number().int().min(20).max(250),
        hips: z.number().int().min(20).max(250),
        weight: z.number().int().min(10).max(300),
        status: z.enum(["AVAILABLE", "SERVING"]).default("AVAILABLE"),
        photo: z.string().min(1).max(700000).nullable().optional(),
      }).parse(raw);
      if (body.photo) {
        const match = body.photo.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/]+={0,2})$/);
        assert(match, "Ảnh phải có định dạng JPEG hoặc PNG", 400);
        const bytes = Buffer.from(match[2], "base64");
        assert(bytes.length <= 500000 && bytes.toString("base64") === match[2] &&
          (match[1] === "jpeg" ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) :
            bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))),
        "Ảnh không hợp lệ hoặc lớn hơn 500 KB", 400);
      }
      assert(!active || body.status === "SERVING", "Người bón đang có đơn phục vụ chưa kết thúc", 409);
      const data = { ...body, updatedAt: new Date() };
      if (old) await update(tx, "MealAssistants", { id: old.id }, { $set: data });
      else await insert(tx, "MealAssistants", { ...data, id: assistantId });
    }
    await audit(tx, actor, action, assistantId);
    return { id: assistantId };
  }
  const kind = action.startsWith("special-") ? "SPECIAL" : "FOOD";
  await authorize(tx, actor, kind);
  const specialPurpose =
    kind === "SPECIAL" && !action.endsWith("-status")
      ? z.enum(purposes).parse(raw.purpose)
      : null;
  if (action === "food-item" || action === "special-service") {
    await staff(tx, actor, ["Admin"]);
    const body = z
      .object({
        id: z.string().uuid().optional(),
        code: z.string().trim().min(2).max(50).optional(),
        name: z.string().trim().min(2).max(120),
        unit: z.string().trim().min(1).max(30),
        price: money,
        enabled: z.boolean().default(true),
      })
      .parse(raw);
    const serviceId = body.id || id();
    const old = body.id && (await first(tx, "Services", { id: body.id }));
    assert(!body.id || old?.category === kind, "Không tìm thấy dịch vụ", 404);
    assert(
      !old || kind !== "SPECIAL" || old.specialPurpose === specialPurpose,
      "Không thể chuyển dịch vụ giữa các nhóm hỗ trợ",
      409,
    );
    const data = {
      name: body.name,
      unit: body.unit,
      price: body.price,
      enabled: body.enabled,
      code: body.code || old?.code || `${kind}_${serviceId}`,
      category: kind,
      specialPurpose,
      cleaning: false,
      fullClean: false,
    };
    if (old) await update(tx, "Services", { id: serviceId }, { $set: data });
    else await insert(tx, "Services", { ...data, id: serviceId });
    await audit(tx, actor, action, serviceId);
    return { id: serviceId };
  }
  if (action.endsWith("-status")) {
    const body = z
      .object({ id: z.string().uuid(), status: z.enum(statuses) })
      .parse(raw);
    const order = await first(tx, "Orders", { id: body.id, kind });
    assert(order, "Không tìm thấy yêu cầu", 404);
    if (order.status === body.status)
      return { id: order.id, status: order.status, total: order.total };
    const allowed = {
      PENDING: ["PREPARING", "CANCELLED"],
      PREPARING: ["COMPLETED", "CANCELLED"],
      COMPLETED: [],
      CANCELLED: [],
    };
    assert(
      allowed[order.status]?.includes(body.status),
      "Không thể chuyển trạng thái yêu cầu theo cách này",
      409,
    );
    const stay = await first(tx, "Stays", { id: order.stayId });
    assert(stay?.status === "OPEN", "Lượt lưu trú đã kết thúc", 409);
    const at = new Date();
    if (body.status === "COMPLETED") {
      const items = JSON.parse(order.itemsJson);
      for (const item of items) {
        const existing = await first(tx, "StayServiceItems", {
          orderId: order.id,
          serviceId: item.serviceId,
        });
        if (!existing)
          await insert(tx, "StayServiceItems", {
            id: id(),
            stayId: order.stayId,
            serviceId: item.serviceId,
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            category: kind,
            orderId: order.id,
          });
      }
    }
    const changes = {
      status: body.status,
      updatedAt: at,
      ...(body.status === "PREPARING" ? { startedAt: at } : {}),
      ...(body.status === "COMPLETED" ? { completedAt: at } : {}),
      ...(body.status === "CANCELLED" ? { cancelledAt: at } : {}),
    };
    await update(tx, "Orders", { id: order.id }, { $set: changes });
    if (order.mealAssistantId && ["COMPLETED", "CANCELLED"].includes(body.status))
      await update(tx, "MealAssistants", { id: order.mealAssistantId }, {
        $set: { status: "AVAILABLE", updatedAt: at },
      });
    const current = { ...order, ...changes };
    await notifyOrder(
      tx,
      kind,
      current,
      kind === "FOOD" ? "Đơn ăn uống đã cập nhật" : "Yêu cầu hỗ trợ đã cập nhật",
    );
    await audit(tx, actor, action, order.id, { status: body.status });
    return { id: order.id, status: body.status, total: order.total };
  }
  const body = z
    .object({
      stayId: z.string().uuid(),
      mealAssistantId: z.string().uuid().optional(),
      items: z
        .array(
          z.object({
            serviceId: z.string().uuid(),
            quantity: z.number().int().min(1).max(1000),
            notes: z.string().trim().max(300).default(""),
          }),
        )
        .min(1)
        .max(30),
      notes: z.string().trim().max(1000).default(""),
    })
    .parse(raw);
  assert(
    new Set(body.items.map((item) => item.serviceId)).size === body.items.length,
    "Mỗi món hoặc dịch vụ chỉ xuất hiện một lần; hãy cập nhật số lượng",
    400,
  );
  const stay = await first(tx, "Stays", { id: body.stayId });
  assert(stay?.status === "OPEN", "Chỉ tạo yêu cầu cho khách đang lưu trú", 409);
  let assistant;
  if (body.mealAssistantId) {
    assert(kind === "SPECIAL" && specialPurpose === "MEAL_ASSISTANCE", "Chỉ đặt người bón trong dịch vụ đút thức ăn", 400);
    assistant = await first(tx, "MealAssistants", { id: body.mealAssistantId, deleted: false, status: "AVAILABLE" });
    assert(assistant, "Người bón đã được đặt hoặc chưa sẵn sàng phục vụ. Vui lòng chọn người khác.", 409);
    await update(tx, "MealAssistants", { id: assistant.id }, { $set: { status: "SERVING", updatedAt: new Date() } });
  }
  const snapshots = [];
  let total = 0;
  for (const item of body.items) {
    const service = await first(tx, "Services", {
      id: item.serviceId,
      enabled: true,
      category: kind,
      ...(specialPurpose ? { specialPurpose } : {}),
    });
    assert(service, "Món hoặc dịch vụ đã ngừng cung cấp hoặc không hợp lệ", 409);
    total += service.price * item.quantity;
    assert(Number.isSafeInteger(total) && total <= 1000000000, "Tổng tiền vượt giới hạn", 400);
    snapshots.push({
      serviceId: service.id,
      name: service.name,
      unit: service.unit,
      unitPrice: service.price,
      quantity: item.quantity,
      notes: item.notes,
      category: kind,
    });
  }
  const order = {
    id: id(),
    kind,
    specialPurpose,
    stayId: body.stayId,
    status: "PENDING",
    itemsJson: JSON.stringify(snapshots),
    total,
    notes: body.notes,
    createdBy: actor.id,
    mealAssistantId: assistant?.id || null,
    mealAssistantName: assistant?.name || null,
  };
  await insert(tx, "Orders", order);
  await notifyOrder(
    tx,
    kind,
    order,
    kind === "FOOD" ? "Đơn ăn uống mới" : "Yêu cầu hỗ trợ riêng mới",
  );
  await audit(tx, actor, action, order.id);
  return { id: order.id, status: order.status, total };
}
