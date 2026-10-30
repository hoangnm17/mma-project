import sql from "mssql";
import { config } from "./config.js";
let pool;
export async function database() {
  if (!pool) {
    const connection = new sql.ConnectionPool(config.sql);
    connection.on("error", (error) =>
      console.error("SQL pool:", error.code || "connection error"),
    );
    pool = connection.connect().catch((error) => {
      pool = undefined;
      throw error;
    });
  }
  return pool;
}
export async function query(db, text, params = {}) {
  const request = db.request();
  const used = new Set(
    [...text.matchAll(/@([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]),
  );
  for (const [key, value] of Object.entries(params))
    if (used.has(key)) request.input(key, value === undefined ? null : value);
  return (await request.query(text)).recordset || [];
}
export const one = async (db, text, params) =>
  (await query(db, text, params))[0];
// One property: a transaction-owned mutex makes availability, finance and assignment
// decisions serializable across every API process and worker. Constraints remain a second guard.
export async function transaction(work) {
  const tx = new sql.Transaction(await database());
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    await query(
      tx,
      "DECLARE @r int; EXEC @r=sp_getapplock @Resource='StayFlow.property',@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=15000; IF @r<0 THROW 51000,'Không lấy được khóa giao dịch',1;",
    );
    const result = await work(tx);
    await tx.commit();
    return result;
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      /* SQL may already roll back */
    }
    throw error;
  }
}
export async function closeDatabase() {
  if (pool) await (await pool).close();
  pool = undefined;
}
