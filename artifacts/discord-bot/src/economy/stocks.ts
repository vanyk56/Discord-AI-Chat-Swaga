import { getStock, updateStock, getHolding, updateHolding, addCoins, logTransaction, Stock } from "./db.js";

// ─── PRICE ENGINE ─────────────────────────────────────────────────────────

/**
 * Recalculates stock price on buy.
 * Price rises proportionally to demand: each % of available shares bought → +2% price.
 */
export function calculateBuyPrice(stock: Stock, sharesBought: number): { pricePerShare: number; totalCost: number; newPrice: number } {
  const pricePerShare = stock.price;
  const totalCost = parseFloat((pricePerShare * sharesBought).toFixed(2));

  const impact = (sharesBought / Math.max(stock.totalShares, 1)) * 0.15;
  const newPrice = parseFloat((stock.price * (1 + impact)).toFixed(2));

  return { pricePerShare, totalCost, newPrice };
}

/**
 * Recalculates stock price on sell.
 * Price drops proportionally to supply.
 */
export function calculateSellPrice(stock: Stock, sharesSold: number): { pricePerShare: number; totalRevenue: number; newPrice: number } {
  const pricePerShare = stock.price;
  const totalRevenue = parseFloat((pricePerShare * sharesSold).toFixed(2));

  const impact = (sharesSold / Math.max(stock.totalShares, 1)) * 0.12;
  const newPrice = parseFloat(Math.max(1, stock.price * (1 - impact)).toFixed(2));

  return { pricePerShare, totalRevenue, newPrice };
}

// ─── BUY SHARES ───────────────────────────────────────────────────────────

export interface BuyResult {
  ok: boolean;
  error?: string;
  sharesBought?: number;
  totalCost?: number;
  pricePerShare?: number;
  newPrice?: number;
  newBalance?: number;
}

export function buyShares(
  guildId: string,
  userId: string,
  username: string,
  symbol: string,
  amount: number,
  userBalance: number
): BuyResult {
  const stock = getStock(guildId, symbol);
  if (!stock) return { ok: false, error: "Акция не найдена." };
  if (stock.ownerId === userId) return { ok: false, error: "Нельзя покупать собственные акции." };
  if (stock.availableShares < amount) return { ok: false, error: `Доступно только **${stock.availableShares}** акций.` };

  const { pricePerShare, totalCost, newPrice } = calculateBuyPrice(stock, amount);
  if (userBalance < totalCost) return { ok: false, error: `Недостаточно монет. Нужно **${totalCost}**, у тебя **${userBalance}**.` };

  const existing = getHolding(guildId, userId, symbol);
  const existingShares = existing?.shares ?? 0;
  const existingAvg = existing?.avgBuyPrice ?? 0;
  const newAvg = existingShares > 0
    ? parseFloat(((existingAvg * existingShares + pricePerShare * amount) / (existingShares + amount)).toFixed(2))
    : pricePerShare;

  updateHolding(guildId, userId, symbol, existingShares + amount, newAvg);

  updateStock(guildId, symbol, {
    availableShares: stock.availableShares - amount,
    price: newPrice,
    priceHistory: [...(stock.priceHistory ?? [stock.price]).slice(-23), newPrice],
    lastActivityAt: new Date().toISOString(),
  });

  addCoins(guildId, userId, username, -totalCost);

  logTransaction({
    guildId, userId, username,
    type: "stock_buy",
    amount: totalCost,
    note: `Куплено ${amount} акций ${symbol} по ${pricePerShare}`,
  });

  return { ok: true, sharesBought: amount, totalCost, pricePerShare, newPrice, newBalance: userBalance - totalCost };
}

// ─── SELL SHARES ──────────────────────────────────────────────────────────

export interface SellResult {
  ok: boolean;
  error?: string;
  sharesSold?: number;
  totalRevenue?: number;
  pricePerShare?: number;
  newPrice?: number;
  profit?: number;
}

export function sellShares(
  guildId: string,
  userId: string,
  username: string,
  symbol: string,
  amount: number
): SellResult {
  const stock = getStock(guildId, symbol);
  if (!stock) return { ok: false, error: "Акция не найдена." };

  const holding = getHolding(guildId, userId, symbol);
  if (!holding || holding.shares < amount) {
    return { ok: false, error: `У тебя только **${holding?.shares ?? 0}** акций ${symbol}.` };
  }

  const { pricePerShare, totalRevenue, newPrice } = calculateSellPrice(stock, amount);
  const profit = parseFloat((totalRevenue - holding.avgBuyPrice * amount).toFixed(2));

  const remainingShares = holding.shares - amount;
  updateHolding(guildId, userId, symbol, remainingShares, holding.avgBuyPrice);

  updateStock(guildId, symbol, {
    availableShares: stock.availableShares + amount,
    price: newPrice,
    priceHistory: [...(stock.priceHistory ?? [stock.price]).slice(-23), newPrice],
    lastActivityAt: new Date().toISOString(),
  });

  addCoins(guildId, userId, username, totalRevenue);

  logTransaction({
    guildId, userId, username,
    type: "stock_sell",
    amount: totalRevenue,
    note: `Продано ${amount} акций ${symbol} по ${pricePerShare} (прибыль: ${profit > 0 ? "+" : ""}${profit})`,
  });

  return { ok: true, sharesSold: amount, totalRevenue, pricePerShare, newPrice, profit };
}

// ─── PRICE CHART (ASCII sparkline) ────────────────────────────────────────

export function sparkline(prices: number[]): string {
  if (prices.length < 2) return "—";
  const bars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  return prices.map((p) => bars[Math.min(7, Math.floor(((p - min) / range) * 7))] ?? "▁").join("");
}
