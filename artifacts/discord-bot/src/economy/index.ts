import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js";
import {
  getWallet, addCoins, setLastMessageReward, setLastDaily,
  getLeaderboard, getStock, listStocks, createStock, getConfig,
  setConfig, logTransaction, getUserHoldings, DEFAULT_CONFIG,
  recordStockActivity, type EconomyConfig,
} from "./db.js";
import { buyShares, sellShares, sparkline } from "./stocks.js";

const RED = 0xdc2626;

// ─── /баланс ───────────────────────────────────────────────────────────────

export async function handleBalance(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("участник") ?? interaction.user;
  const guildId = interaction.guildId!;
  const cfg = getConfig(guildId);
  const wallet = getWallet(guildId, target.id, target.username);
  const holdings = getUserHoldings(guildId, target.id);
  const holdingEntries = Object.entries(holdings);

  let stockValue = 0;
  for (const [sym, h] of holdingEntries) {
    const stock = getStock(guildId, sym);
    if (stock) stockValue += stock.price * h.shares;
  }
  stockValue = parseFloat(stockValue.toFixed(2));

  const embed = new EmbedBuilder()
    .setColor(RED)
    .setTitle(`${cfg.currencyEmoji} Баланс: ${target.displayName}`)
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: "💰 Монеты в кошельке", value: `**${wallet.balance}** ${cfg.currencyName}`, inline: true },
      { name: "📈 Стоимость акций", value: `**${stockValue}** ${cfg.currencyName}`, inline: true },
      { name: "💼 Итого состояние", value: `**${wallet.balance + stockValue}** ${cfg.currencyName}`, inline: true },
      { name: "📊 Всего заработано", value: `${wallet.totalEarned} ${cfg.currencyName}`, inline: true },
      { name: "💬 Сообщений", value: `${wallet.messageCount ?? 0}`, inline: true },
      { name: "📦 Портфель акций", value: holdingEntries.length > 0
        ? holdingEntries.map(([sym, h]) => {
            const s = getStock(guildId, sym);
            if (!s) return `${sym}: ${h.shares} шт.`;
            const pnl = ((s.price - h.avgBuyPrice) / h.avgBuyPrice * 100).toFixed(1);
            const sign = parseFloat(pnl) >= 0 ? "+" : "";
            return `**${sym}** ${h.shares} шт. @ ${s.price} (${sign}${pnl}%)`;
          }).join("\n")
        : "Портфель пуст", inline: false },
    )
    .setFooter({ text: `Ежедневный бонус: ${cfg.dailyReward} ${cfg.currencyName} | Монет за сообщение: ${cfg.messageReward}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// ─── /топ-богачей ──────────────────────────────────────────────────────────

export async function handleTop(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId!;
  const cfg = getConfig(guildId);
  const board = getLeaderboard(guildId);

  if (board.length === 0) {
    await interaction.reply({ content: "Пока никто не заработал монет 🥲", ephemeral: true });
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];
  const lines = board.map((entry, i) => {
    const medal = medals[i] ?? `**${i + 1}.**`;
    return `${medal} <@${entry.userId}> — **${entry.wallet.balance}** ${cfg.currencyEmoji}`;
  });

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(RED)
        .setTitle(`${cfg.currencyEmoji} Топ богачей сервера`)
        .setDescription(lines.join("\n"))
        .setTimestamp(),
    ],
  });
}

// ─── /перевести ────────────────────────────────────────────────────────────

export async function handleTransfer(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("участник", true);
  const amount = interaction.options.getInteger("сумма", true);
  const guildId = interaction.guildId!;
  const cfg = getConfig(guildId);

  if (target.id === interaction.user.id) {
    await interaction.reply({ content: "Нельзя переводить самому себе.", ephemeral: true });
    return;
  }
  if (target.bot) {
    await interaction.reply({ content: "Нельзя переводить ботам.", ephemeral: true });
    return;
  }
  if (amount <= 0) {
    await interaction.reply({ content: "Сумма должна быть больше 0.", ephemeral: true });
    return;
  }

  const senderWallet = getWallet(guildId, interaction.user.id, interaction.user.username);
  const tax = Math.max(1, Math.floor(amount * (cfg.transferTaxPct / 100)));
  const total = amount + tax;

  if (senderWallet.balance < total) {
    await interaction.reply({
      content: `Недостаточно монет. Нужно **${total}** (с учётом налога ${tax}) — у тебя **${senderWallet.balance}**.`,
      ephemeral: true,
    });
    return;
  }

  addCoins(guildId, interaction.user.id, interaction.user.username, -total);
  addCoins(guildId, target.id, target.username, amount);

  logTransaction({ guildId, userId: interaction.user.id, username: interaction.user.username, type: "transfer_out", amount, note: `→ ${target.username}` });
  logTransaction({ guildId, userId: target.id, username: target.username, type: "transfer_in", amount, note: `← ${interaction.user.username}` });

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(RED)
        .setTitle("💸 Перевод выполнен")
        .setDescription(`<@${interaction.user.id}> отправил **${amount}** ${cfg.currencyEmoji} → <@${target.id}>`)
        .addFields({ name: "Комиссия", value: `${tax} ${cfg.currencyName}`, inline: true })
        .setTimestamp(),
    ],
  });
}

// ─── /ежедневный ──────────────────────────────────────────────────────────

export async function handleDaily(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId!;
  const cfg = getConfig(guildId);
  const wallet = getWallet(guildId, interaction.user.id, interaction.user.username);

  if (wallet.lastDaily) {
    const last = new Date(wallet.lastDaily);
    const nextAvailable = new Date(last.getTime() + 24 * 60 * 60 * 1000);
    if (Date.now() < nextAvailable.getTime()) {
      const hrs = Math.floor((nextAvailable.getTime() - Date.now()) / 3600000);
      const mins = Math.floor(((nextAvailable.getTime() - Date.now()) % 3600000) / 60000);
      await interaction.reply({ content: `⏰ Ежедневный бонус уже получен. Следующий через **${hrs}ч ${mins}м**.`, ephemeral: true });
      return;
    }
  }

  addCoins(guildId, interaction.user.id, interaction.user.username, cfg.dailyReward);
  setLastDaily(guildId, interaction.user.id);
  logTransaction({ guildId, userId: interaction.user.id, username: interaction.user.username, type: "daily", amount: cfg.dailyReward, note: "Ежедневный бонус" });

  const newBal = wallet.balance + cfg.dailyReward;
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(RED)
        .setTitle("🎁 Ежедневный бонус!")
        .setDescription(`+**${cfg.dailyReward}** ${cfg.currencyEmoji} на твой счёт!`)
        .addFields({ name: "Баланс", value: `${newBal} ${cfg.currencyName}`, inline: true })
        .setFooter({ text: "Возвращайся завтра за следующим бонусом" })
        .setTimestamp(),
    ],
  });
}

// ─── /акции список ────────────────────────────────────────────────────────

export async function handleStockList(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId!;
  const cfg = getConfig(guildId);
  const stocks = listStocks(guildId);

  if (stocks.length === 0) {
    await interaction.reply({ content: "На этом сервере ещё нет акций. Создай первым! `/акции создать`", ephemeral: true });
    return;
  }

  const lines = stocks.map((s) => {
    const change = s.priceHistory.length >= 2
      ? (((s.price - s.priceHistory[s.priceHistory.length - 2]!) / s.priceHistory[s.priceHistory.length - 2]!) * 100).toFixed(1)
      : "0.0";
    const arrow = parseFloat(change) >= 0 ? "🔺" : "🔻";
    return `**${s.symbol}** — ${s.name}\n${arrow} **${s.price}** ${cfg.currencyEmoji} (${parseFloat(change) >= 0 ? "+" : ""}${change}%) · Доступно: ${s.availableShares}/${s.totalShares}`;
  });

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(RED)
        .setTitle("📊 Биржа сервера")
        .setDescription(lines.join("\n\n"))
        .setFooter({ text: "Используй /акции инфо <символ> для подробностей" })
        .setTimestamp(),
    ],
  });
}

// ─── /акции создать ──────────────────────────────────────────────────────

export async function handleStockCreate(interaction: ChatInputCommandInteraction) {
  const symbol = interaction.options.getString("символ", true).toUpperCase().replace(/[^A-ZА-Я0-9]/g, "").slice(0, 5);
  const name = interaction.options.getString("название", true).slice(0, 40);
  const shares = interaction.options.getInteger("акций", true);
  const priceOpt = interaction.options.getInteger("цена") ?? 10;
  const guildId = interaction.guildId!;
  const cfg = getConfig(guildId);

  if (symbol.length < 2) {
    await interaction.reply({ content: "Символ должен содержать 2–5 букв/цифр.", ephemeral: true });
    return;
  }
  if (shares < 10 || shares > 10000) {
    await interaction.reply({ content: "Количество акций: от 10 до 10 000.", ephemeral: true });
    return;
  }
  if (priceOpt < 1 || priceOpt > 10000) {
    await interaction.reply({ content: "Стартовая цена: от 1 до 10 000.", ephemeral: true });
    return;
  }
  if (getStock(guildId, symbol)) {
    await interaction.reply({ content: `Акция **${symbol}** уже существует на этом сервере.`, ephemeral: true });
    return;
  }

  const wallet = getWallet(guildId, interaction.user.id, interaction.user.username);
  if (wallet.balance < cfg.stockCreationCost) {
    await interaction.reply({ content: `Для создания акции нужно **${cfg.stockCreationCost}** ${cfg.currencyName}. У тебя **${wallet.balance}**.`, ephemeral: true });
    return;
  }

  addCoins(guildId, interaction.user.id, interaction.user.username, -cfg.stockCreationCost);
  createStock(guildId, {
    symbol,
    name,
    ownerId: interaction.user.id,
    ownerUsername: interaction.user.username,
    price: priceOpt,
    totalShares: shares,
    availableShares: shares,
    priceHistory: [priceOpt],
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    activityCount: 0,
  });
  logTransaction({ guildId, userId: interaction.user.id, username: interaction.user.username, type: "transfer_out", amount: cfg.stockCreationCost, note: `Создание акции ${symbol}` });

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(RED)
        .setTitle("🏦 Акция выпущена!")
        .setDescription(`**${symbol}** — ${name}`)
        .addFields(
          { name: "Акций выпущено", value: `${shares}`, inline: true },
          { name: "Стартовая цена", value: `${priceOpt} ${cfg.currencyEmoji}`, inline: true },
          { name: "Стоимость выпуска", value: `${cfg.stockCreationCost} ${cfg.currencyEmoji}`, inline: true },
        )
        .setDescription(
          `**${symbol}** — ${name}\n\n💡 Цена растёт когда ты активен в чате — каждые 10 сообщений от тебя прибавляют +0.5% к цене. Также цена меняется от объёма торгов!`
        )
        .setFooter({ text: `Создал: ${interaction.user.username}` })
        .setTimestamp(),
    ],
  });
}

// ─── /акции купить ────────────────────────────────────────────────────────

export async function handleStockBuy(interaction: ChatInputCommandInteraction) {
  const symbol = interaction.options.getString("символ", true).toUpperCase();
  const amount = interaction.options.getInteger("количество", true);
  const guildId = interaction.guildId!;
  const cfg = getConfig(guildId);

  if (amount <= 0) {
    await interaction.reply({ content: "Количество должно быть больше 0.", ephemeral: true });
    return;
  }

  const wallet = getWallet(guildId, interaction.user.id, interaction.user.username);
  const result = buyShares(guildId, interaction.user.id, interaction.user.username, symbol, amount, wallet.balance);

  if (!result.ok) {
    await interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
    return;
  }

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle("✅ Акции куплены!")
        .addFields(
          { name: "Тикер", value: `**${symbol}**`, inline: true },
          { name: "Куплено акций", value: `${result.sharesBought}`, inline: true },
          { name: "Цена за шт.", value: `${result.pricePerShare} ${cfg.currencyEmoji}`, inline: true },
          { name: "Потрачено", value: `${result.totalCost} ${cfg.currencyEmoji}`, inline: true },
          { name: "Новая цена акции", value: `${result.newPrice} ${cfg.currencyEmoji}`, inline: true },
          { name: "Остаток монет", value: `${result.newBalance?.toFixed(2)} ${cfg.currencyEmoji}`, inline: true },
        )
        .setTimestamp(),
    ],
  });
}

// ─── /акции продать ───────────────────────────────────────────────────────

export async function handleStockSell(interaction: ChatInputCommandInteraction) {
  const symbol = interaction.options.getString("символ", true).toUpperCase();
  const amount = interaction.options.getInteger("количество", true);
  const guildId = interaction.guildId!;
  const cfg = getConfig(guildId);

  if (amount <= 0) {
    await interaction.reply({ content: "Количество должно быть больше 0.", ephemeral: true });
    return;
  }

  const result = sellShares(guildId, interaction.user.id, interaction.user.username, symbol, amount);

  if (!result.ok) {
    await interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
    return;
  }

  const profitStr = result.profit !== undefined
    ? (result.profit > 0 ? `+${result.profit}` : `${result.profit}`)
    : "0";

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(result.profit! >= 0 ? 0x22c55e : 0xdc2626)
        .setTitle(result.profit! >= 0 ? "💰 Акции проданы с прибылью!" : "📉 Акции проданы в минус")
        .addFields(
          { name: "Тикер", value: `**${symbol}**`, inline: true },
          { name: "Продано акций", value: `${result.sharesSold}`, inline: true },
          { name: "Цена за шт.", value: `${result.pricePerShare} ${cfg.currencyEmoji}`, inline: true },
          { name: "Получено", value: `${result.totalRevenue} ${cfg.currencyEmoji}`, inline: true },
          { name: "Прибыль/убыток", value: `${profitStr} ${cfg.currencyEmoji}`, inline: true },
          { name: "Новая цена акции", value: `${result.newPrice} ${cfg.currencyEmoji}`, inline: true },
        )
        .setTimestamp(),
    ],
  });
}

// ─── /акции инфо ──────────────────────────────────────────────────────────

export async function handleStockInfo(interaction: ChatInputCommandInteraction) {
  const symbol = interaction.options.getString("символ", true).toUpperCase();
  const guildId = interaction.guildId!;
  const cfg = getConfig(guildId);
  const stock = getStock(guildId, symbol);

  if (!stock) {
    await interaction.reply({ content: `Акция **${symbol}** не найдена.`, ephemeral: true });
    return;
  }

  const history = stock.priceHistory ?? [stock.price];
  const first = history[0] ?? stock.price;
  const change = (((stock.price - first) / first) * 100).toFixed(1);
  const chart = sparkline(history.slice(-20));
  const lastPrice = history.length >= 2 ? history[history.length - 2] : first;
  const dayChange = (((stock.price - lastPrice!) / lastPrice!) * 100).toFixed(1);
  const soldShares = stock.totalShares - stock.availableShares;

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(RED)
        .setTitle(`📈 ${stock.symbol} — ${stock.name}`)
        .setDescription(`**Цена:** ${stock.price} ${cfg.currencyEmoji}\n\`${chart}\``)
        .addFields(
          { name: "Изменение (последнее)", value: `${parseFloat(dayChange) >= 0 ? "🔺 +" : "🔻 "}${dayChange}%`, inline: true },
          { name: "Изменение (всё время)", value: `${parseFloat(change) >= 0 ? "🔺 +" : "🔻 "}${change}%`, inline: true },
          { name: "Владелец", value: `<@${stock.ownerId}>`, inline: true },
          { name: "Доступно акций", value: `${stock.availableShares} / ${stock.totalShares}`, inline: true },
          { name: "Продано", value: `${soldShares}`, inline: true },
          { name: "Рыночная кап.", value: `${(stock.price * stock.totalShares).toFixed(0)} ${cfg.currencyEmoji}`, inline: true },
        )
        .setFooter({ text: `График: последние ${Math.min(history.length, 20)} точек · Активность владельца движет ценой` })
        .setTimestamp(),
    ],
  });
}

// ─── /конфиг-монеты ───────────────────────────────────────────────────────

export async function handleEconomyConfig(interaction: ChatInputCommandInteraction) {
  const member = interaction.member;
  if (!member || !(member as any).permissions?.has?.(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: "Только администраторы могут настраивать экономику.", ephemeral: true });
    return;
  }

  const guildId = interaction.guildId!;
  const sub = interaction.options.getSubcommand();

  if (sub === "показать") {
    const cfg = getConfig(guildId);
    const lines = [
      `💬 Монет за сообщение: **${cfg.messageReward}**`,
      `⏱ Кулдаун награды (сек): **${cfg.messageRewardCooldownSec}**`,
      `🎁 Ежедневный бонус: **${cfg.dailyReward}**`,
      `🏆 Монет за победу в игре: **${cfg.gameWinReward}**`,
      `🏦 Стоимость создания акции: **${cfg.stockCreationCost}**`,
      `💸 Налог на перевод: **${cfg.transferTaxPct}%**`,
      `🪙 Название валюты: **${cfg.currencyName}** ${cfg.currencyEmoji}`,
    ];
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(RED)
          .setTitle("⚙️ Настройки экономики")
          .setDescription(lines.join("\n"))
          .setTimestamp(),
      ],
      ephemeral: true,
    });
    return;
  }

  const patch: Partial<EconomyConfig> = {};
  const n = (key: string) => interaction.options.getInteger(key) ?? undefined;
  const s = (key: string) => interaction.options.getString(key) ?? undefined;

  if (sub === "монеты-за-сообщение") {
    patch.messageReward = n("значение") ?? DEFAULT_CONFIG.messageReward;
    patch.messageRewardCooldownSec = n("кулдаун") ?? DEFAULT_CONFIG.messageRewardCooldownSec;
  } else if (sub === "ежедневный") {
    patch.dailyReward = n("значение") ?? DEFAULT_CONFIG.dailyReward;
  } else if (sub === "победа-в-игре") {
    patch.gameWinReward = n("значение") ?? DEFAULT_CONFIG.gameWinReward;
  } else if (sub === "акция-стоимость") {
    patch.stockCreationCost = n("значение") ?? DEFAULT_CONFIG.stockCreationCost;
  } else if (sub === "налог-перевода") {
    patch.transferTaxPct = n("значение") ?? DEFAULT_CONFIG.transferTaxPct;
  } else if (sub === "валюта") {
    patch.currencyName = s("название") ?? DEFAULT_CONFIG.currencyName;
    patch.currencyEmoji = s("эмодзи") ?? DEFAULT_CONFIG.currencyEmoji;
  }

  const cfg = setConfig(guildId, patch);
  await interaction.reply({
    content: `✅ Настройки обновлены! Монет за сообщение: **${cfg.messageReward}**, ежедневный: **${cfg.dailyReward}**, победа: **${cfg.gameWinReward}**, создание акции: **${cfg.stockCreationCost}**, налог: **${cfg.transferTaxPct}%**`,
    ephemeral: true,
  });
}

// ─── /дать-монеты ─────────────────────────────────────────────────────────

export async function handleAdminGive(interaction: ChatInputCommandInteraction) {
  const member = interaction.member;
  if (!member || !(member as any).permissions?.has?.(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: "Только администраторы могут выдавать монеты.", ephemeral: true });
    return;
  }

  const target = interaction.options.getUser("участник", true);
  const amount = interaction.options.getInteger("сумма", true);
  const guildId = interaction.guildId!;
  const cfg = getConfig(guildId);

  const newBal = addCoins(guildId, target.id, target.username, amount);
  logTransaction({ guildId, userId: target.id, username: target.username, type: "admin_give", amount, note: `Выдано администратором ${interaction.user.username}` });

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(amount >= 0 ? 0x22c55e : RED)
        .setTitle(amount >= 0 ? "✅ Монеты выданы" : "✅ Монеты сняты")
        .setDescription(`<@${target.id}> ${amount >= 0 ? "получил" : "потерял"} **${Math.abs(amount)}** ${cfg.currencyEmoji}`)
        .addFields({ name: "Новый баланс", value: `${newBal} ${cfg.currencyName}`, inline: true })
        .setTimestamp(),
    ],
  });
}

// ─── PASSIVE MESSAGE REWARD ───────────────────────────────────────────────

export function handleMessageReward(guildId: string, userId: string, username: string): void {
  const cfg = getConfig(guildId);
  if (cfg.messageReward <= 0) return;
  const wallet = getWallet(guildId, userId, username);
  const now = Date.now();
  const cooldown = cfg.messageRewardCooldownSec * 1000;
  if (wallet.lastMessageReward && now - new Date(wallet.lastMessageReward).getTime() < cooldown) return;
  addCoins(guildId, userId, username, cfg.messageReward);
  setLastMessageReward(guildId, userId);
  recordStockActivity(guildId, userId);
}
