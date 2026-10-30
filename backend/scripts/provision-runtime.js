import sql from "mssql";
import { config } from "../src/config.js";
const password = process.env.APP_SQL_PASSWORD;
if (!password || password.length < 16 || password.includes("'"))
  throw Error("APP_SQL_PASSWORD cần >=16 ký tự và không chứa dấu nháy đơn.");
// This one-time bootstrap runs with the migration identity, never the API identity.
const master = await new sql.ConnectionPool({
  ...config.sql,
  database: "master",
}).connect();
await master
  .request()
  .query(
    `IF SUSER_ID('stayflow_app') IS NULL CREATE LOGIN stayflow_app WITH PASSWORD=N'${password}';`,
  );
await master.close();
const db = await new sql.ConnectionPool(config.sql).connect();
await db
  .request()
  .query(
    "IF USER_ID('stayflow_app') IS NULL CREATE USER stayflow_app FOR LOGIN stayflow_app; ALTER ROLE db_datareader ADD MEMBER stayflow_app; ALTER ROLE db_datawriter ADD MEMBER stayflow_app;",
  );
await db.close();
console.log("Đã cấp quyền DML cho runtime, không cấp DDL/server admin.");
