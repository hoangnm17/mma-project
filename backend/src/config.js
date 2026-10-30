export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET,
  origins: (process.env.CORS_ORIGINS || "http://localhost:8081").split(","),
  guestUrl: process.env.GUEST_WEB_URL || "http://localhost:8081/guest",
  sql: {
    server: process.env.SQL_SERVER || "localhost",
    port: Number(process.env.SQL_PORT || 1433),
    database: process.env.SQL_DATABASE || "StayFlow",
    user: process.env.SQL_USER || "sa",
    password: process.env.SQL_PASSWORD,
    options: {
      encrypt: process.env.SQL_ENCRYPT !== "false",
      trustServerCertificate: process.env.SQL_TRUST_CERT === "true",
      enableArithAbort: true,
    },
    pool: { max: 15, min: 0, idleTimeoutMillis: 30000 },
    requestTimeout: 30000,
  },
};
export function requireSecrets() {
  if (!config.jwtSecret || config.jwtSecret.length < 32)
    throw new Error("JWT_SECRET phải có ít nhất 32 ký tự.");
  if (!config.sql.password) throw new Error("Thiếu SQL_PASSWORD.");
}
