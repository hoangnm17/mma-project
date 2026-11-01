import { MongoClient } from "mongodb";
import { config } from "./config.js";
import { execute } from "./mongo-store.js";
import { views } from "./mongo-views.js";
let connection;
export async function database() {
  if (!connection) {
    const client = new MongoClient(config.mongo.uri, {
      ...(config.mongo.authDatabase ? { authSource: config.mongo.authDatabase } : {}),
      maxPoolSize: config.mongo.poolSize,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    connection = client
      .connect()
      .then(() => ({ client, db: client.db(config.mongo.database) }))
      .catch(async (error) => {
        connection = undefined;
        await client.close();
        throw error;
      });
  }
  return connection;
}
export async function query(context, operation, params = {}) {
  if (typeof operation === "function")
    return execute(context, operation(params));
  if (!views[operation]) throw Error("Unknown Mongo operation: " + operation);
  return views[operation](context, params);
}
export const one = async (context, operation, params) =>
  (await query(context, operation, params))[0];
export const like = (value) =>
  new RegExp(
    String(value)
      .replace(/^%|%$/g, "")
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    "i",
  );
// All property mutations touch this document FIRST. Conflicting transactions retry
// on a fresh snapshot, preserving booking/finance/assignment invariants across processes.
export async function transaction(work) {
  const context = await database();
  const session = context.client.startSession();
  try {
    return await session.withTransaction(
      async () => {
        const tx = { ...context, session };
        const lock = await context.db
          .collection("PropertyMutex")
          .updateOne(
            { _id: "property" },
            { $inc: { revision: 1 } },
            { session },
          );
        if (lock.modifiedCount !== 1)
          throw Error("Chạy migration MongoDB trước khi khởi động API.");
        return work(tx);
      },
      {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        readPreference: "primary",
        maxCommitTimeMS: 15000,
        timeoutMS: 45000,
      },
    );
  } finally {
    await session.endSession();
  }
}
export async function closeDatabase() {
  const old = connection;
  connection = undefined;
  if (old) await (await old).client.close();
}
