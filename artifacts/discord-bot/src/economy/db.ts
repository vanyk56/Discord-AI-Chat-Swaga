import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve("data");
const WALLETS_FILE = path.join(DATA_DIR, "economy-wallets.json");
const STOCKS_FILE = path.join(DATA_DIR, "economy-stocks.json");
const HOLDINGS_FILE = path.join(DATA_DIR, "economy-holdings.json");
const CONFIG_FILE = path.join(DATA_DIR, "economy-config.json");
const TX_FILE = path.join(DATA_DIR, "economy-transactions.json");

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ─── TYPES ─────────────────────────────────────────────────────────────────

export interface Wallet {
  balance: number;
  username: string;
  totalEarned: number;
  lastMessageReward: string;
  lastDaily: string;
  messageCount: number;
}

export interface Stock {
  symbol: string;
  name: string;
  ownerId: string;
  ownerUsername: string;
  price: number;
  totalShares: number;
  availableShares: number;
  priceHistory: number[];
  createdAt: string;
  lastActivityAt: string;
  activityCount: number;
}

export interface Holding {
  shares: number;
  avgBuyPrice: number;
}

export interface Transaction {
  id: string;
  guildId: string;
  userId: string;
  username: string;
  type: "earn" | "transfer_out" | "transfer_in" | "stock_buy" | "stock_sell" | "daily" | "admin_give";
  amount: number;
  note: string;
  timestamp: string;
}

export interface EconomyConfig {
  messageReward: number;
  messageRewardCooldownSec: number;
  dailyReward: number;
  gameWinReward: number;
  stockCreationCost: number;
  transferTaxPct: number;
  currencyName: string;
  currencyEmoji: string;
}

export const DEFAULT_CONFIG: EconomyConfig = {
  messageReward: 5,
  messageRewardCooldownSec: 30,
  dailyReward: 200,
  gameWinReward: 50,
  stockCreationCost: 500,
  transferTaxPct: 2,
  currencyName: "монет",
  currencyEmoji: "🪙",
};

type WalletsData = Record<string, Record<string, Wallet>>;
type StocksData = Record<string, Record<string, Stock>>;
type HoldingsData = Record<string, Record<string, Record<string, Holding>>>;
type ConfigData = Record<string, EconomyConfig>;
type TxData = Transaction[];

// ─── WALLETS ───────────────────────────────────────────────────────────────

function loadWallets(): WalletsData {
  try {
    if (fs.existsSync(WALLETS_FILE)) return JSON.parse(fs.readFileSync(WALLETS_FILE, "utf-8"));
  } catch {}
  return {};
}
function saveWallets(d: WalletsData) {
  ensureDir();
  fs.writeFileSync(WALLETS_FILE, JSON.stringify(d, null, 2));
}
export function getWallet(guildId: string, userId: string, username: string): Wallet {
  const d = loadWallets();
  if (!d[guildId]) d[guildId] = {};
  if (!d[guildId]![userId]) {
    d[guildId]![userId] = {
      balance: 0,
      username,
      totalEarned: 0,
      lastMessageReward: "",
      lastDaily: "",
      messageCount: 0,
    };
    saveWallets(d);
  } else {
    d[guildId]![userId]!.username = username;
    saveWallets(d);
  }
  return d[guildId]![userId]!;
}
export function addCoins(guildId: string, userId: string, username: string, amount: number): number {
  const d = loadWallets();
  if (!d[guildId]) d[guildId] = {};
  if (!d[guildId]![userId]) {
    d[guildId]![userId] = { balance: 0, username, totalEarned: 0, lastMessageReward: "", lastDaily: "", messageCount: 0 };
  }
  const w = d[guildId]![userId]!;
  w.balance = Math.max(0, w.balance + amount);
  w.username = username;
  if (amount > 0) w.totalEarned += amount;
  saveWallets(d);
  return w.balance;
}
export function setLastMessageReward(guildId: string, userId: string) {
  const d = loadWallets();
  if (d[guildId]?.[userId]) {
    d[guildId]![userId]!.lastMessageReward = new Date().toISOString();
    d[guildId]![userId]!.messageCount = (d[guildId]![userId]!.messageCount ?? 0) + 1;
    saveWallets(d);
  }
}
export function setLastDaily(guildId: string, userId: string) {
  const d = loadWallets();
  if (d[guildId]?.[userId]) {
    d[guildId]![userId]!.lastDaily = new Date().toISOString();
    saveWallets(d);
  }
}
export function getLeaderboard(guildId: string): Array<{ userId: string; wallet: Wallet }> {
  const d = loadWallets();
  const guild = d[guildId] ?? {};
  return Object.entries(guild)
    .map(([userId, wallet]) => ({ userId, wallet }))
    .sort((a, b) => b.wallet.balance - a.wallet.balance)
    .slice(0, 10);
}

// ─── STOCKS ────────────────────────────────────────────────────────────────

function loadStocks(): StocksData {
  try {
    if (fs.existsSync(STOCKS_FILE)) return JSON.parse(fs.readFileSync(STOCKS_FILE, "utf-8"));
  } catch {}
  return {};
}
function saveStocks(d: StocksData) {
  ensureDir();
  fs.writeFileSync(STOCKS_FILE, JSON.stringify(d, null, 2));
}
export function getStock(guildId: string, symbol: string): Stock | null {
  const d = loadStocks();
  return d[guildId]?.[symbol.toUpperCase()] ?? null;
}
export function listStocks(guildId: string): Stock[] {
  const d = loadStocks();
  return Object.values(d[guildId] ?? {}).sort((a, b) => b.price - a.price);
}
export function createStock(guildId: string, stock: Stock): void {
  const d = loadStocks();
  if (!d[guildId]) d[guildId] = {};
  d[guildId]![stock.symbol] = stock;
  saveStocks(d);
}
export function updateStock(guildId: string, symbol: string, patch: Partial<Stock>): void {
  const d = loadStocks();
  if (d[guildId]?.[symbol]) {
    Object.assign(d[guildId]![symbol]!, patch);
    saveStocks(d);
  }
}
export function recordStockActivity(guildId: string, ownerId: string): void {
  const d = loadStocks();
  const guild = d[guildId] ?? {};
  let changed = false;
  for (const sym of Object.keys(guild)) {
    const s = guild[sym]!;
    if (s.ownerId === ownerId) {
      s.activityCount = (s.activityCount ?? 0) + 1;
      if (s.activityCount % 10 === 0) {
        const bump = s.price * 0.005;
        s.price = parseFloat((s.price + bump).toFixed(2));
        s.priceHistory = [...(s.priceHistory ?? [s.price]).slice(-23), s.price];
        s.lastActivityAt = new Date().toISOString();
      }
      changed = true;
    }
  }
  if (changed) saveStocks(d);
}

// ─── HOLDINGS ──────────────────────────────────────────────────────────────

function loadHoldings(): HoldingsData {
  try {
    if (fs.existsSync(HOLDINGS_FILE)) return JSON.parse(fs.readFileSync(HOLDINGS_FILE, "utf-8"));
  } catch {}
  return {};
}
function saveHoldings(d: HoldingsData) {
  ensureDir();
  fs.writeFileSync(HOLDINGS_FILE, JSON.stringify(d, null, 2));
}
export function getHolding(guildId: string, userId: string, symbol: string): Holding | null {
  const d = loadHoldings();
  return d[guildId]?.[userId]?.[symbol] ?? null;
}
export function getUserHoldings(guildId: string, userId: string): Record<string, Holding> {
  const d = loadHoldings();
  return d[guildId]?.[userId] ?? {};
}
export function updateHolding(guildId: string, userId: string, symbol: string, shares: number, avgPrice: number): void {
  const d = loadHoldings();
  if (!d[guildId]) d[guildId] = {};
  if (!d[guildId]![userId]) d[guildId]![userId] = {};
  if (shares <= 0) {
    delete d[guildId]![userId]![symbol];
  } else {
    d[guildId]![userId]![symbol] = { shares, avgBuyPrice: avgPrice };
  }
  saveHoldings(d);
}

// ─── CONFIG ────────────────────────────────────────────────────────────────

function loadConfig(): ConfigData {
  try {
    if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch {}
  return {};
}
function saveConfig(d: ConfigData) {
  ensureDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(d, null, 2));
}
export function getConfig(guildId: string): EconomyConfig {
  const d = loadConfig();
  return { ...DEFAULT_CONFIG, ...(d[guildId] ?? {}) };
}
export function setConfig(guildId: string, patch: Partial<EconomyConfig>): EconomyConfig {
  const d = loadConfig();
  d[guildId] = { ...DEFAULT_CONFIG, ...(d[guildId] ?? {}), ...patch };
  saveConfig(d);
  return d[guildId]!;
}

// ─── TRANSACTIONS ──────────────────────────────────────────────────────────

function loadTx(): TxData {
  try {
    if (fs.existsSync(TX_FILE)) return JSON.parse(fs.readFileSync(TX_FILE, "utf-8"));
  } catch {}
  return [];
}
function saveTx(d: TxData) {
  ensureDir();
  fs.writeFileSync(TX_FILE, JSON.stringify(d.slice(-500), null, 2));
}
export function logTransaction(tx: Omit<Transaction, "id" | "timestamp">): void {
  const d = loadTx();
  d.push({ ...tx, id: Math.random().toString(36).slice(2), timestamp: new Date().toISOString() });
  saveTx(d);
}
