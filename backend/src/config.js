export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET,
  trustProxy: process.env.TRUST_PROXY === "1" ? 1 : false,
  origins: (process.env.CORS_ORIGINS || "http://localhost:8081").split(","),
  guestUrl: process.env.GUEST_WEB_URL || "http://localhost:8081/guest",
  mongo: {
    uri:
      process.env.MONGO_URI ||
      "mongodb://127.0.0.1:27027/?replicaSet=rs0&directConnection=true",
    database: process.env.MONGO_DATABASE || "StayFlow",
    poolSize: Math.max(
      1,
      Math.min(20, Number(process.env.MONGO_POOL_SIZE) || 5),
    ),
  },
};
export function requireSecrets() {
  if (!config.jwtSecret || config.jwtSecret.length < 32)
    throw new Error("JWT_SECRET phải có ít nhất 32 ký tự.");
  if (!process.env.MONGO_URI && process.env.NODE_ENV === "production")
    throw new Error("Thiếu MONGO_URI.");
}
