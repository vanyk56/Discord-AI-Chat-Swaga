import { Router, type IRouter } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";

type BotStatusFile = {
  online?: boolean;
  status?: string;
  botTag?: string;
  botId?: string | null;
  guildCount?: number;
  lastHeartbeat?: string;
  startedAt?: string;
  uptimeSeconds?: number;
};

const router: IRouter = Router();
const BOT_STATUS_FILE =
  process.env.BOT_STATUS_FILE ??
  (process.cwd().includes(`${path.sep}artifacts${path.sep}`)
    ? path.resolve(process.cwd(), "../../.bot-status.json")
    : path.resolve(process.cwd(), ".bot-status.json"));
const STALE_AFTER_MS = 45_000;

router.get("/bot/status", async (_req, res) => {
  try {
    const raw = await readFile(BOT_STATUS_FILE, "utf8");
    const status = JSON.parse(raw) as BotStatusFile;
    const heartbeatTime = status.lastHeartbeat ? Date.parse(status.lastHeartbeat) : 0;
    const isFresh = Number.isFinite(heartbeatTime) && Date.now() - heartbeatTime <= STALE_AFTER_MS;
    const online = status.online === true && isFresh;

    res.json({
      online,
      status: online ? "online" : "offline",
      botTag: status.botTag ?? "SWAGAgpt.AI#7648",
      botId: status.botId ?? null,
      guildCount: status.guildCount ?? 0,
      lastHeartbeat: status.lastHeartbeat ?? null,
      startedAt: status.startedAt ?? null,
      uptimeSeconds: online ? status.uptimeSeconds ?? 0 : 0,
    });
  } catch {
    res.json({
      online: false,
      status: "offline",
      botTag: "SWAGAgpt.AI#7648",
      botId: null,
      guildCount: 0,
      lastHeartbeat: null,
      startedAt: null,
      uptimeSeconds: 0,
    });
  }
});

export default router;