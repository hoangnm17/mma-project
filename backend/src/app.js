import express from "express";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { config } from "./config.js";
import { database, one, query, transaction } from "./db.js";
import { login, refresh, exchange, authenticate } from "./auth.js";
import { hash, guestStay, staff, audit, canAccessSpecial } from "./repository.js";
import { assert } from "./domain.js";
import { hotelAction } from "./services/hotel.js";
import { housekeepingAction } from "./services/housekeeping.js";
import { cleaningDraft } from "./services/ai.js";
import { crmAction } from "./services/crm.js";
import { orderAction, orderActions } from "./services/orders.js";
import {
  reserveAi,
  managerAssistant,
  structured,
} from "./services/ai-tools.js";
import { readResource } from "./reads.js";
export function createApp() {
  const app = express();
  const webDirectory = process.env.WEB_DIST
    ? path.resolve(process.env.WEB_DIST)
    : fileURLToPath(new URL("../../frontend/dist/", import.meta.url));
  const scriptHashes = new Set();
  for (const file of ["index.html", "guest.html", "_sitemap.html", "+not-found.html"]) {
    let html;
    try { html = readFileSync(path.join(webDirectory, file), "utf8"); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\bsrc\s*=/.test(match[1]) || !match[2].trim()) continue;
      scriptHashes.add("'sha256-" + createHash("sha256").update(match[2]).digest("base64") + "'");
    }
  }
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "script-src": ["'self'", ...scriptHashes],
          "upgrade-insecure-requests":
            process.env.NODE_ENV === "production" ? [] : null,
          "connect-src": [
            "'self'",
            ...config.origins,
            ...config.origins.map((origin) => origin.replace(/^http/, "ws")),
          ],
        },
      },
    }),
  );
  app.use(cors({ origin: config.origins }));
  app.use(express.json({ limit: "32kb" }));
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 240,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.get("/health", async (req, res) => {
    try {
      await query(await database(), "health");
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "database-unavailable" });
    }
  });
  const authLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 30,
    message: { error: "Quá nhiều lần thử. Vui lòng thử lại sau." },
  });
  app.post("/api/auth/login", authLimit, async (req, res) => {
    const b = z
      .object({ username: z.string().max(80), password: z.string().max(100) })
      .parse(req.body);
    res.json(await login(b.username, b.password));
  });
  app.post("/api/auth/refresh", authLimit, async (req, res) => {
    const b = z
      .object({ refreshToken: z.string().min(30).max(100) })
      .parse(req.body);
    res.json(await refresh(b.refreshToken));
  });
  app.post("/api/guest-access/exchange", authLimit, async (req, res) => {
    const b = z.object({ token: z.string().min(30).max(100) }).parse(req.body);
    res.json(await exchange(b.token));
  });
  app.use("/api", authenticate);
  app.post(
    "/api/ai/draft",
    rateLimit({ windowMs: 60000, limit: 10 }),
    async (req, res) => {
      const b = z
        .object({
          stayId: z.string().uuid(),
          text: z.string().trim().min(3).max(1000),
        })
        .parse(req.body);
      await guestStay(await database(), req.actor, b.stayId);
      await reserveAi(req.actor);
      res.json(await cleaningDraft(b.text));
    },
  );
  app.post("/api/ai/manager", async (req, res) => {
    const b = z
      .object({ question: z.string().trim().min(3).max(1000) })
      .parse(req.body);
    res.json(await managerAssistant(req.actor, b.question));
  });
  app.post("/api/ai/marketing", async (req, res) => {
    await staff(await database(), req.actor, ["Admin"]);
    const b = z.object({ brief: z.string().min(5).max(1000) }).parse(req.body);
    await reserveAi(req.actor);
    const data = await structured(
      "Soạn nội dung chăm sóc khách hàng tiếng Việt ngắn gọn, chỉ bản nháp cần người duyệt, không bịa giảm giá/chính sách/sự kiện. Không gửi đi.",
      b.brief,
      {
        type: "object",
        additionalProperties: false,
        properties: { draft: { type: "string" } },
        required: ["draft"],
      },
      "marketing_draft",
    );
    res.json({
      draft: z.string().max(2000).parse(data.draft),
      requiresApproval: true,
    });
  });
  app.get("/api/reports.csv", async (req, res) => {
    await staff(await database(), req.actor, ["Admin"]);
    const d = await readResource(req.actor, "dashboard", req.query);
    res
      .type("text/csv")
      .attachment("stayflow.csv")
      .send(
        "\uFEFFChỉ tiêu,Giá trị\r\nDoanh thu," +
          d.revenue +
          "\r\nThực thu," +
          d.collected +
          "\r\nCông nợ," +
          d.debt +
          "\r\nTiền phòng," + d.report.bySource.ROOM +
          "\r\nDịch vụ," + d.report.bySource.SERVICE +
          "\r\nĂn uống," + d.report.bySource.FOOD +
          "\r\nDịch vụ riêng," + d.report.bySource.SPECIAL +
          "\r\nHóa đơn chưa thanh toán," + d.report.invoiceCounts.UNPAID +
          "\r\nHóa đơn thanh toán một phần," + d.report.invoiceCounts.PARTIAL +
          "\r\nHóa đơn đã thanh toán," + d.report.invoiceCounts.PAID +
          "\r\nLượt nhận phòng," + d.report.arrivals +
          "\r\nLượt trả phòng," + d.report.departures +
          "\r\nThời gian lưu trú trung bình (giờ)," + d.report.averageStayHours +
          "\r\nTỷ lệ sử dụng phòng (%)," + d.report.occupancyRate +
          "\r\nTừ thời điểm," + (d.report.from || "Tất cả") +
          "\r\nĐến trước thời điểm," + (d.report.to || "Tất cả") + "\r\n",
      );
  });
  app.get("/api/:resource", async (req, res) =>
    res.json(await readResource(req.actor, req.params.resource, req.query)),
  );
  app.post("/api/actions/:action", async (req, res) => {
    const requestKey = z
      .string()
      .min(8)
      .max(100)
      .parse(req.header("Idempotency-Key"));
    const actorKey =
      req.actor.kind === "guest" ? "guest:" + req.actor.accessId : req.actor.id;
    const requestHash = hash(
      JSON.stringify({ action: req.params.action, body: req.body }),
    );
    const result = await transaction(async (tx) => {
      if (req.actor.kind === "staff")
        await staff(tx, req.actor, ["Admin", "Receptionist", "Cleaner"]);
      else await guestStay(tx, req.actor, req.actor.stayId);
      if (actionNeedsSpecial(req.params.action))
        assert(await canAccessSpecial(tx, req.actor), "Không có quyền sử dụng dịch vụ riêng", 403);
      const old = await one(
        tx,
        (p) => ({
          collection: "IdempotencyRecords",
          filter: {
            $and: [{ actorKey: p.actorKey }, { requestKey: p.requestKey }],
          },
        }),
        { actorKey, requestKey },
      );
      if (old) {
        assert(
          old.requestHash === requestHash,
          "Idempotency-Key đã dùng với dữ liệu khác",
        );
        return JSON.parse(old.resultJson);
      }
      const action = req.params.action;
      const cleaning =
        action.startsWith("task-") ||
        action.startsWith("offer-") ||
        action === "cleaner-availability";
      const crm = [
        "campaign",
        "voucher",
        "membership",
        "incident",
        "incident-resolve",
      ].includes(action);
      const value = await (
        orderActions.has(action) ? orderAction : cleaning ? housekeepingAction : crm ? crmAction : hotelAction
      )(tx, req.actor, action, req.body);
      await audit(
        tx,
        req.actor,
        "api." + action,
        value.id ||
          req.body.taskId ||
          req.body.stayId ||
          req.body.customerId ||
          req.body.userId ||
          req.body.roomId ||
          req.body.id ||
          req.actor.id ||
          req.actor.accessId,
        { requestKey, actorKind: req.actor.kind },
      );
      await query(
        tx,
        (p) => ({
          collection: "IdempotencyRecords",
          insert: {
            actorKey: p.actorKey,
            requestKey: p.requestKey,
            requestHash: p.requestHash,
            resultJson: p.resultJson,
          },
        }),
        {
          actorKey,
          requestKey,
          requestHash,
          resultJson: JSON.stringify(value),
        },
      );
      return value;
    });
    res.json(result);
  });
  app.use(
    express.static(webDirectory, {
      extensions: ["html"],
    }),
  );
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof z.ZodError)
      return res.status(400).json({
        error: "Dữ liệu chưa hợp lệ",
        fields: error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    if ([11000, 121].includes(error.code))
      return res.status(409).json({
        error: "Dữ liệu trùng hoặc liên kết không hợp lệ. Vui lòng tải lại.",
      });
    if (!error.status) console.error(error.message);
    res.status(error.status || 500).json({
      error: error.status ? error.message : "Lỗi máy chủ. Vui lòng thử lại.",
      ...(error.aiCode ? { code: error.aiCode, ...(error.providerStatus ? { providerStatus: error.providerStatus } : {}) } : {}),
    });
  });
  return app;
}
const actionNeedsSpecial = (action) => action.startsWith("special-");
