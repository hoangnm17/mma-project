import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { database, closeDatabase, transaction } from "../../src/db.js";
import { readResource } from "../../src/reads.js";
import { config } from "../../src/config.js";
test("Mongo indexes, rollback, native reads and server validation", async (t) => {
  assert.match(config.mongo.database, /^StayFlow_\d+Test$/);
  const ctx = await database(),
    id = randomUUID();
  try {
    await t.test("transaction rolls back every write", async () => {
      await assert.rejects(
        transaction(async (tx) => {
          await tx.db
            .collection("AuditLogs")
            .insertOne(
              {
                id,
                actorId: null,
                action: "test.rollback",
                entityId: id,
                details: "{}",
                createdAt: new Date(),
              },
              { session: tx.session },
            );
          throw Error("rollback");
        }),
        /rollback/,
      );
      assert.equal(
        await ctx.db.collection("AuditLogs").countDocuments({ id }),
        0,
      );
    });
    await t.test(
      "partial unique indexes guard both active task and active cleaner",
      async () => {
        const col = ctx.db.collection("CleaningAssignments");
        const taskId = "mongo-test-" + id,
          cleanerId = "mongo-test-cleaner-" + id;
        const base = {
          id,
          taskId,
          cleanerId,
          offerId: null,
          assignedAt: new Date(),
          status: "ASSIGNED",
          isActive: true,
        };
        try {
          await col.insertOne(base);
          await assert.rejects(
            col.insertOne({
              ...base,
              _id: undefined,
              id: randomUUID(),
              cleanerId: randomUUID(),
            }),
            (e) => e.code === 11000,
          );
          await assert.rejects(
            col.insertOne({
              ...base,
              _id: undefined,
              id: randomUUID(),
              taskId: randomUUID(),
            }),
            (e) => e.code === 11000,
          );
        } finally {
          await col.deleteMany({ id });
        }
      },
    );
    await t.test(
      "database validator rejects invalid money and state",
      async () => {
        await assert.rejects(
          ctx.db
            .collection("Services")
            .insertOne({
              id,
              code: id,
              name: "Invalid",
              unit: "lần",
              price: -1,
              cleaning: false,
              fullClean: false,
              enabled: true,
            }),
          (e) => e.code === 121,
        );
      },
    );
    await t.test(
      "all desk/admin read resources work without exposing credentials",
      async () => {
        const admin = await ctx.db
          .collection("Users")
          .findOne({ username: "admin" });
        const actor = { ...admin, kind: "staff" };
        for (const name of [
          "me",
          "services",
          "notifications",
          "tasks",
          "rooms",
          "customers",
          "bookings",
          "stays",
          "invoices",
          "roomTypes",
          "campaign-options",
          "maintenance",
          "cleaners",
          "dashboard",
          "incidents",
          "campaigns",
          "vouchers",
          "users",
          "audit",
          "forecast",
        ]) {
          const result = await readResource(actor, name);
          assert.ok(result, name);
          assert.equal(
            JSON.stringify(result).includes("passwordHash"),
            false,
            name,
          );
        }
      },
    );
  } finally {
    await closeDatabase();
  }
});
