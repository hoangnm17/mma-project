import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import sql from "mssql";
import { config } from "../src/config.js";
import { database, query, transaction, closeDatabase } from "../src/db.js";
if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(config.sql.database))
  throw Error("Tên database không hợp lệ");
const master = await new sql.ConnectionPool({
  ...config.sql,
  database: "master",
}).connect();
await master
  .request()
  .query(
    `IF DB_ID('${config.sql.database}') IS NULL CREATE DATABASE [${config.sql.database}]`,
  );
await master.close();
const pool = await database();
await query(
  pool,
  "IF OBJECT_ID('SchemaMigrations') IS NULL CREATE TABLE SchemaMigrations(name varchar(150) PRIMARY KEY,hash varchar(64) NOT NULL,appliedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME())",
);
for (const file of (await readdir(new URL("../migrations/", import.meta.url)))
  .filter((f) => f.endsWith(".sql"))
  .sort()) {
  const source = await readFile(
    new URL("../migrations/" + file, import.meta.url),
    "utf8",
  );
  const hash = createHash("sha256").update(source).digest("hex");
  await transaction(async (tx) => {
    const [old] = await query(
      tx,
      "SELECT hash FROM SchemaMigrations WHERE name=@file",
      { file },
    );
    if (old) {
      if (old.hash !== hash) throw Error("Migration đã đổi: " + file);
      return;
    }
    for (const batch of source.split(/^GO\s*$/im))
      if (batch.trim()) await query(tx, batch);
    await query(tx, "INSERT SchemaMigrations(name,hash) VALUES(@file,@hash)", {
      file,
      hash,
    });
    console.log("Applied", file);
  });
}
await closeDatabase();
