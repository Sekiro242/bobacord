import "dotenv/config";
import express from "express";
import cors from "cors";
import * as mediasoup from "mediasoup";
import { workerSettings } from "./mediasoup-config.js";
import { roomManager } from "./room-manager.js";
import { logger } from "./logger.js";
import internalRouter from "./routes/internal.js";

// ─── Validate environment ─────────────────────────────────────────────────────

const PORT = Number(process.env.PORT) || 5002;
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

if (!INTERNAL_SECRET) {
  logger.error("INTERNAL_SECRET environment variable is required");
  process.exit(1);
}

// ─── Create mediasoup Worker ──────────────────────────────────────────────────

async function createWorker() {
  const worker = await mediasoup.createWorker(workerSettings);

  worker.on("died", (error) => {
    logger.error({ error }, "mediasoup Worker died — exiting process");
    process.exit(1);
  });

  logger.info({ pid: worker.pid }, "mediasoup Worker created");
  return worker;
}

// ─── Express App ──────────────────────────────────────────────────────────────

async function main() {
  const worker = await createWorker();
  roomManager.setWorker(worker);

  const app = express();

  app.use(cors({ origin: "*" }));
  app.use(express.json());

  // Health check — public
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "voice-server" });
  });

  // Internal API — only reachable from api-server (protected by secret header)
  app.use("/internal", internalRouter);

  app.listen(PORT, () => {
    logger.info(
      {
        port: PORT,
        announcedIp: process.env.ANNOUNCED_IP || "127.0.0.1",
        rtcPorts: `${process.env.RTC_MIN_PORT || 40000}-${process.env.RTC_MAX_PORT || 49999}`,
      },
      "Voice server listening"
    );
  });
}

main().catch((err) => {
  logger.error({ err }, "Fatal error starting voice server");
  process.exit(1);
});
