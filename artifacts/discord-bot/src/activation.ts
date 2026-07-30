import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "../../../activation-data.json");

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface ActivatedGuild {
  code: string;
  activatedAt: string;
  activatedBy: string;
  activatedByName: string;
}

interface ActivationData {
  activatedGuilds: Record<string, ActivatedGuild>;
  availableCodes: string[];
  usedCodes: Record<string, string>; // code -> guildId
}

// ─── LOAD / SAVE ──────────────────────────────────────────────────────────────

function loadData(): ActivationData {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")) as ActivationData;
    }
  } catch {}
  return { activatedGuilds: {}, availableCodes: [], usedCodes: {} };
}

function saveData(data: ActivationData): void {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

/** Check if a guild is activated */
export function isGuildActivated(guildId: string): boolean {
  const data = loadData();
  return guildId in data.activatedGuilds;
}

/** Generate N random activation codes */
export function generateCodes(count: number = 1): string[] {
  const data = loadData();
  const newCodes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = `SWAG-${crypto.randomBytes(3).toString("hex").toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    newCodes.push(code);
    data.availableCodes.push(code);
  }
  saveData(data);
  return newCodes;
}

/** Activate a guild with a code. Returns error string or null on success. */
export function activateGuild(
  guildId: string,
  code: string,
  userId: string,
  userName: string
): "already_active" | "invalid_code" | "code_used" | null {
  const data = loadData();

  if (data.activatedGuilds[guildId]) return "already_active";

  const normalised = code.trim().toUpperCase();

  if (normalised in data.usedCodes) return "code_used";

  const idx = data.availableCodes.findIndex((c) => c === normalised);
  if (idx === -1) return "invalid_code";

  // Activate!
  data.availableCodes.splice(idx, 1);
  data.usedCodes[normalised] = guildId;
  data.activatedGuilds[guildId] = {
    code: normalised,
    activatedAt: new Date().toISOString(),
    activatedBy: userId,
    activatedByName: userName,
  };

  saveData(data);
  return null;
}

/** Deactivate a guild (owner only) */
export function deactivateGuild(guildId: string): boolean {
  const data = loadData();
  if (!data.activatedGuilds[guildId]) return false;
  const code = data.activatedGuilds[guildId].code;
  delete data.activatedGuilds[guildId];
  delete data.usedCodes[code];
  saveData(data);
  return true;
}

/** Get all activated guilds info */
export function getActivationInfo(guildId: string): ActivatedGuild | null {
  const data = loadData();
  return data.activatedGuilds[guildId] ?? null;
}

/** List all activated guilds */
export function listActivatedGuilds(): Record<string, ActivatedGuild> {
  return loadData().activatedGuilds;
}

/** List available (unused) codes */
export function listAvailableCodes(): string[] {
  return loadData().availableCodes;
}
