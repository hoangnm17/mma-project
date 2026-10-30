import { createServer } from "node:http";
import { Server } from "socket.io";
import { config, requireSecrets } from "./config.js";
import { createApp } from "./app.js";
import { authenticateToken } from "./auth.js";
import { closeDatabase } from "./db.js";
import { tick } from "./worker.js";
requireSecrets();
const server = createServer(createApp());
const io = new Server(server, { cors: { origin: config.origins } });
io.use(async (socket, next) => {
  try {
    const actor = await authenticateToken(socket.handshake.auth.token);
    if (actor.kind !== "staff") throw Error("Staff only");
    socket.data.actor = actor;
    next();
  } catch {
    next(Error("Unauthorized"));
  }
});
io.on("connection", (socket) => {
  socket.join("user:" + socket.data.actor.id);
  const timer = setInterval(async () => {
    try {
      await authenticateToken(socket.handshake.auth.token);
    } catch {
      socket.disconnect(true);
    }
  }, 15000);
  socket.on("disconnect", () => clearInterval(timer));
});
let running = false;
const timer = setInterval(async () => {
  if (running) return;
  running = true;
  try {
    await tick(io);
  } catch (e) {
    console.error("Worker:", e.message);
  } finally {
    running = false;
  }
}, 5000);
server.listen(config.port, "0.0.0.0", () =>
  console.log("StayFlow API port", config.port),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    clearInterval(timer);
    io.close();
    server.close();
    await closeDatabase();
    process.exit(0);
  });
