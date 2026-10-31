import { definitions } from "../src/mongo-schema.js";
const primary = {
  CleanerProfiles: ["userId"],
  CleaningReviews: ["taskId"],
  DeviceTokens: ["token"],
  PaymentAllocations: ["receiptId", "invoiceId"],
  IdempotencyRecords: ["actorKey", "requestKey"],
  AiUsage: ["actorKey", "usageDate"],
};
const enums = {
  "Users.role": ["Admin", "Receptionist", "Cleaner"],
  "Rooms.cleanState": ["CLEAN", "DIRTY"],
  "Bookings.status": ["CONFIRMED", "CANCELLED", "CHECKED_IN"],
  "Stays.status": ["OPEN", "CLOSED"],
  "Bookings.mode": ["HOUR", "NIGHT", "DAY"],
  "Stays.mode": ["HOUR", "NIGHT", "DAY"],
  "Receipts.method": ["CASH", "TRANSFER"],
  "HousekeepingTasks.status": [
    "PENDING",
    "ASSIGNED",
    "IN_PROGRESS",
    "AWAITING_VERIFICATION",
    "COMPLETED",
    "CANCELLED",
  ],
  "CleaningOffers.status": [
    "PENDING",
    "ACCEPTED",
    "REJECTED",
    "EXPIRED",
    "REVOKED",
  ],
  "Incidents.status": ["OPEN", "RESOLVED"],
};
const positive = new Set([
  "capacity",
  "guests",
  "quantity",
  "maxUses",
  "perCustomer",
]);
export async function up(db) {
  for (const [name, fields] of Object.entries(definitions)) {
    const properties = {};
    for (const [key, spec] of Object.entries(fields)) {
      properties[key] = {
        bsonType:
          spec.type === "number"
            ? ["int", "long", "double", "decimal"]
            : spec.type,
      };
      if (!spec.required)
        properties[key].bsonType = [
          ...(Array.isArray(properties[key].bsonType)
            ? properties[key].bsonType
            : [properties[key].bsonType]),
          "null",
        ];
      if (spec.type === "number")
        properties[key].minimum = positive.has(key) || key === "amount" ? 1 : 0;
      if (key === "rating") {
        properties[key].minimum = 1;
        properties[key].maximum = 5;
      }
      if (enums[name + "." + key])
        properties[key].enum = enums[name + "." + key];
    }
    const checks = [
      {
        $jsonSchema: {
          bsonType: "object",
          required: Object.keys(fields).filter((k) => fields[k].required),
          properties,
        },
      },
    ];
    const end = fields.endsAt
      ? "endsAt"
      : name === "HousekeepingTasks"
        ? "windowEnd"
        : null;
    if (end)
      checks.push({
        $expr: {
          $gt: [
            "$" + end,
            "$" + (name === "HousekeepingTasks" ? "windowStart" : "startsAt"),
          ],
        },
      });
    if (name === "Receipts")
      checks.push({
        $or: [
          { bookingId: { $type: "string" } },
          { stayId: { $type: "string" } },
        ],
      });
    const validator = { $and: checks };
    if (!(await db.listCollections({ name }).toArray()).length)
      await db.createCollection(name, {
        validator,
        collation: { locale: "en", strength: 2 },
      });
    else
      await db.command({
        collMod: name,
        validator,
        validationLevel: "strict",
        validationAction: "error",
      });
    const keys = Object.fromEntries(
      (primary[name] || ["id"]).map((k) => [k, 1]),
    );
    await db
      .collection(name)
      .createIndex(keys, { unique: true, name: "identity" });
  }
  const index = (col, keys, options = {}) =>
    db.collection(col).createIndex(keys, options);
  for (const [col, field] of [
    ["Users", "username"],
    ["Rooms", "number"],
    ["Services", "code"],
    ["Vouchers", "code"],
    ["GuestAccessTokens", "tokenHash"],
    ["RefreshSessions", "tokenHash"],
    ["HousekeepingTasks", "dedupeKey"],
    ["OutboxEvents", "eventKey"],
    ["Invoices", "stayId"],
    ["VoucherRedemptions", "invoiceId"],
  ])
    await index(col, { [field]: 1 }, { unique: true });
  for (const [col, field] of [
    ["Stays", "bookingId"],
    ["StayServiceItems", "taskId"],
    ["CleaningAssignments", "offerId"],
  ])
    await index(
      col,
      { [field]: 1 },
      {
        unique: true,
        partialFilterExpression: { [field]: { $type: "string" } },
      },
    );
  await index(
    "Stays",
    { roomId: 1 },
    {
      name: "one_open_stay",
      unique: true,
      partialFilterExpression: { status: "OPEN" },
    },
  );
  for (const field of ["taskId", "cleanerId"])
    await index(
      "CleaningAssignments",
      { [field]: 1 },
      {
        name: "active_" + field,
        unique: true,
        partialFilterExpression: { isActive: true },
      },
    );
  await index(
    "CleaningOffers",
    { taskId: 1, cleanerId: 1, round: 1, taskVersion: 1 },
    { unique: true },
  );
  await index("Notifications", { userId: 1, eventKey: 1 }, { unique: true });
  const regular = {
    Bookings: [
      { roomId: 1, status: 1, startsAt: 1, endsAt: 1 },
      { status: 1, startsAt: 1 },
    ],
    Stays: [
      { customerId: 1, startedAt: -1 },
      { roomId: 1, startedAt: -1 },
      { status: 1, expectedEnd: 1 },
      { campaignId: 1 },
    ],
    HousekeepingTasks: [
      { status: 1, nextDispatchAt: 1, windowStart: 1 },
      { stayId: 1, serviceId: 1, status: 1 },
      { roomId: 1, createdAt: -1 },
    ],
    CleaningOffers: [{ cleanerId: 1, status: 1, expiresAt: 1 }],
    CleaningAssignments: [{ cleanerId: 1, assignedAt: -1 }, { taskId: 1 }],
    Notifications: [{ userId: 1, createdAt: -1 }],
    OutboxEvents: [{ status: 1, nextAttemptAt: 1 }],
    Receipts: [{ stayId: 1 }, { bookingId: 1 }],
    ReceiptReturns: [{ receiptId: 1 }],
    Adjustments: [{ invoiceId: 1 }],
    Refunds: [{ invoiceId: 1 }],
    CleanerShifts: [{ userId: 1, startsAt: 1, endsAt: 1 }],
    Maintenance: [{ roomId: 1, resolvedAt: 1, startsAt: 1, endsAt: 1 }],
    VoucherRedemptions: [{ voucherId: 1, customerId: 1 }],
    StayServiceItems: [{ stayId: 1 }],
    DeviceTokens: [{ userId: 1 }],
    Customers: [{ phone: 1 }],
  };
  for (const [col, specs] of Object.entries(regular))
    for (const spec of specs) await index(col, spec);
  await db
    .collection("PropertyMutex")
    .updateOne(
      { _id: "property" },
      { $setOnInsert: { revision: 0 } },
      { upsert: true },
    );
}
