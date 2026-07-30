import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  GuildMember,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
  ButtonInteraction,
} from "discord.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ─── PERSISTENT STORAGE ──────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DICK_FILE = path.join(__dirname, "../../../dick-data.json");

interface DickEntry {
  size: number;
  lastUsed: string;    // ISO date — for /dick daily cooldown
  lastPotion: string;  // ISO date — for /potion 48h cooldown
  username: string;
}

type GuildData = Record<string, DickEntry>; // userId -> DickEntry
type AllData = Record<string, GuildData>;   // guildId -> GuildData

function loadData(): AllData {
  try {
    if (fs.existsSync(DICK_FILE)) {
      return JSON.parse(fs.readFileSync(DICK_FILE, "utf-8")) as AllData;
    }
  } catch (err) {
    console.error("[Dick] Failed to load data:", err);
  }
  return {};
}

function saveData(data: AllData): void {
  try {
    fs.writeFileSync(DICK_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[Dick] Failed to save data:", err);
  }
}

function getGuild(data: AllData, guildId: string): GuildData {
  if (!data[guildId]) data[guildId] = {};
  return data[guildId]!;
}

function getEntry(guild: GuildData, userId: string, username: string): DickEntry {
  if (!guild[userId]) {
    guild[userId] = { size: 10, lastUsed: "", lastPotion: "", username };
  } else {
    guild[userId]!.username = username;
    if (!guild[userId]!.lastPotion) guild[userId]!.lastPotion = "";
  }
  return guild[userId]!;
}

function hoursAgo(isoDate: string, hours: number): boolean {
  if (!isoDate) return true;
  return Date.now() - new Date(isoDate).getTime() >= hours * 3_600_000;
}

function sizeBar(size: number, max: number): string {
  const filled = Math.round((size / max) * 20);
  return "█".repeat(Math.max(0, filled)) + "░".repeat(Math.max(0, 20 - filled));
}

function displayName(interaction: ChatInputCommandInteraction): string {
  return interaction.member instanceof GuildMember
    ? interaction.member.displayName
    : interaction.user.displayName;
}

// ─── COOLDOWN HELPERS ────────────────────────────────────────────────────────

function isToday(isoDate: string): boolean {
  if (!isoDate) return false;
  const last = new Date(isoDate);
  const now = new Date();
  return (
    last.getFullYear() === now.getFullYear() &&
    last.getMonth() === now.getMonth() &&
    last.getDate() === now.getDate()
  );
}

function nextMidnight(): string {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const diff = midnight.getTime() - now.getTime();
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  return `${hours}ч ${minutes}м`;
}

// ─── /dick ───────────────────────────────────────────────────────────────────

export async function handleDick(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Команда доступна только на сервере!", ephemeral: true });
    return;
  }

  const userId = interaction.user.id;
  const username = interaction.member instanceof GuildMember
    ? interaction.member.displayName
    : interaction.user.displayName;

  const data = loadData();
  const guild = getGuild(data, interaction.guildId);
  const entry = getEntry(guild, userId, username);

  if (isToday(entry.lastUsed)) {
    const timeLeft = nextMidnight();
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle("⏳ Кулдаун!")
          .setDescription(`**${username}**, ты уже измерял сегодня!\nСледующий замер через **${timeLeft}**.`)
          .setFooter({ text: `Текущий размер: ${entry.size} см` }),
      ],
    });
    return;
  }

  // Генерируем изменение: -15 до +150 (всегда рандом)
  const change = Math.floor(Math.random() * 166) - 15;
  entry.size = Math.max(1, entry.size + change); // минимум 1 см
  entry.lastUsed = new Date().toISOString();

  saveData(data);

  const sign = change >= 0 ? `+${change}` : `${change}`;
  const emoji = change > 50 ? "🚀" : change > 10 ? "📈" : change === 0 ? "😐" : change > 0 ? "📊" : change > -10 ? "📉" : "💀";
  const sizeEmoji = entry.size >= 200 ? "👑" : entry.size >= 100 ? "🏆" : entry.size >= 50 ? "💪" : entry.size >= 20 ? "😏" : entry.size >= 10 ? "😅" : "😭";

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(change >= 0 ? 0x57F287 : 0xED4245)
        .setTitle(`${emoji} Ежедневный замер`)
        .setDescription(
          `**${username}**, твой агрегат изменился на **${sign} см**!\n\n` +
          `${sizeEmoji} Теперь он: **${entry.size} см**`
        )
        .setFooter({ text: "Следующий замер доступен завтра" }),
    ],
  });
}

// ─── /fight ──────────────────────────────────────────────────────────────────

export async function handleFight(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Команда доступна только на сервере!", ephemeral: true });
    return;
  }

  const target = interaction.options.getUser("цель", true);
  if (target.id === interaction.user.id) {
    await interaction.reply({ content: "❌ Нельзя драться с самим собой!", ephemeral: true });
    return;
  }
  if (target.bot) {
    await interaction.reply({ content: "❌ Боты не участвуют в боях!", ephemeral: true });
    return;
  }

  // Сразу подтверждаем interaction (у Discord лимит 3 сек)
  await interaction.deferReply();

  const attackerId = interaction.user.id;
  const attackerName = interaction.member instanceof GuildMember
    ? interaction.member.displayName
    : interaction.user.displayName;

  const targetMember = interaction.guild?.members.cache.get(target.id);
  const targetName = targetMember?.displayName ?? target.displayName;

  const requestedStake = interaction.options.getInteger("ставка", true);

  // Проверяем размеры
  const data = loadData();
  const guild = getGuild(data, interaction.guildId);
  const attacker = getEntry(guild, attackerId, attackerName);
  const defender = getEntry(guild, target.id, targetName);
  const maxStake = Math.min(attacker.size - 1, defender.size - 1);

  if (maxStake <= 0) {
    await interaction.editReply({ content: "❌ У одного из игроков слишком маленький агрегат для боя (минимум 2 см)!" });
    return;
  }

  const actualStake = Math.min(requestedStake, maxStake);
  const stakeReduced = actualStake < requestedStake;

  // ── Отправляем вызов с кнопками ──────────────────────────────────────────

  const acceptBtn = new ButtonBuilder()
    .setCustomId("fight_accept")
    .setLabel("⚔️ Принять вызов")
    .setStyle(ButtonStyle.Success);

  const declineBtn = new ButtonBuilder()
    .setCustomId("fight_decline")
    .setLabel("🏳️ Отклонить")
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(acceptBtn, declineBtn);

  const challengeEmbed = new EmbedBuilder()
    .setColor(0xFF8C00)
    .setTitle("🍆 Вызов на бой!")
    .setDescription(
      `**${attackerName}** бросает вызов ${target}!\n\n` +
      `🎲 Ставка: **${actualStake} см**` +
      (stakeReduced ? ` *(урезана с ${requestedStake} см)*` : "") + `\n\n` +
      `${target}, ты принимаешь?`
    )
    .setFooter({ text: "Вызов истекает через 60 секунд • Шанс 50/50" });

  await interaction.editReply({ embeds: [challengeEmbed], components: [row] });
  const msg = await interaction.fetchReply();

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.customId === "fight_accept" || i.customId === "fight_decline",
    time: 60_000,
    max: 1,
  });

  collector.on("collect", async (btn: ButtonInteraction) => {
    // Только вызываемый может отвечать
    if (btn.user.id !== target.id) {
      await btn.reply({ content: "❌ Это не твой вызов!", ephemeral: true });
      return;
    }

    if (btn.customId === "fight_decline") {
      await btn.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0x99AAB5)
            .setTitle("🏳️ Вызов отклонён")
            .setDescription(`**${targetName}** отказался от боя. Трус! 🐔`),
        ],
        components: [],
      });
      return;
    }

    // ── Бой принят — разыгрываем результат ──────────────────────────────

    // Перечитываем данные (могли измениться пока ждали)
    const freshData = loadData();
    const freshGuild = getGuild(freshData, interaction.guildId!);
    const freshAttacker = getEntry(freshGuild, attackerId, attackerName);
    const freshDefender = getEntry(freshGuild, target.id, targetName);
    const freshMax = Math.min(freshAttacker.size - 1, freshDefender.size - 1);
    const finalStake = Math.min(actualStake, Math.max(0, freshMax));

    if (finalStake <= 0) {
      await btn.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0x99AAB5)
            .setTitle("❌ Бой отменён")
            .setDescription("У одного из игроков не хватает размера для ставки!"),
        ],
        components: [],
      });
      return;
    }

    const attackerWins = Math.random() < 0.5;
    const attackerSizeBefore = freshAttacker.size;
    const defenderSizeBefore = freshDefender.size;

    if (attackerWins) {
      freshAttacker.size += finalStake;
      freshDefender.size = Math.max(1, freshDefender.size - finalStake);
    } else {
      freshDefender.size += finalStake;
      freshAttacker.size = Math.max(1, freshAttacker.size - finalStake);
    }

    saveData(freshData);

    const winner = attackerWins ? attackerName : targetName;
    const loser = attackerWins ? targetName : attackerName;

    await btn.update({
      embeds: [
        new EmbedBuilder()
          .setColor(attackerWins ? 0x57F287 : 0xED4245)
          .setTitle("⚔️ Битва агрегатов — РЕЗУЛЬТАТ!")
          .setDescription(
            `🎲 Ставка: **${finalStake} см**\n\n` +
            `🏆 Победил **${winner}**! Забирает **${finalStake} см** у **${loser}**!\n\n` +
            `📏 ${attackerName}: ${attackerSizeBefore} → **${freshAttacker.size} см** ${attackerWins ? "📈" : "📉"}\n` +
            `📏 ${targetName}: ${defenderSizeBefore} → **${freshDefender.size} см** ${!attackerWins ? "📈" : "📉"}`
          )
          .setFooter({ text: "Шанс победы у каждого — 50/50" }),
      ],
      components: [],
    });
  });

  collector.on("end", async (collected) => {
    if (collected.size === 0) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x99AAB5)
            .setTitle("⏰ Вызов истёк")
            .setDescription(`**${targetName}** не ответил на вызов.`),
        ],
        components: [],
      });
    }
  });
}

// ─── /top ─────────────────────────────────────────────────────────────────────

export async function handleDickTop(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Команда доступна только на сервере!", ephemeral: true });
    return;
  }

  const data = loadData();
  const guild = getGuild(data, interaction.guildId);

  const entries = Object.entries(guild)
    .map(([userId, d]) => ({ userId, ...d }))
    .filter((e) => e.size > 0)
    .sort((a, b) => b.size - a.size)
    .slice(0, 10);

  if (entries.length === 0) {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865F2)
          .setTitle("🏆 Топ агрегатов")
          .setDescription("Никто ещё не измерял! Введи `/dick` первым!"),
      ],
    });
    return;
  }

  const medals = ["🥇", "🥈", "🥉"];
  const lines = entries.map((e, i) => {
    const medal = medals[i] ?? `**${i + 1}.**`;
    const bar = "█".repeat(Math.min(20, Math.floor(e.size / 2)));
    return `${medal} **${e.username}** — ${e.size} см\n┃ ${bar}`;
  });

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xF1C40F)
        .setTitle("🏆 Топ агрегатов сервера")
        .setDescription(lines.join("\n\n"))
        .setFooter({ text: "Обновляется каждый день в /dick" }),
    ],
  });
}

// ─── /gift ────────────────────────────────────────────────────────────────────

export async function handleGift(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) { await interaction.reply({ content: "Только на сервере!", ephemeral: true }); return; }
  const target = interaction.options.getUser("кому", true);
  if (target.id === interaction.user.id) { await interaction.reply({ content: "❌ Нельзя дарить самому себе!", ephemeral: true }); return; }
  if (target.bot) { await interaction.reply({ content: "❌ Боты не принимают подарки!", ephemeral: true }); return; }

  const amount = interaction.options.getInteger("размер", true);
  const senderName = displayName(interaction);
  const targetMember = interaction.guild?.members.cache.get(target.id);
  const targetName = targetMember?.displayName ?? target.displayName;

  const data = loadData();
  const guild = getGuild(data, interaction.guildId);
  const sender = getEntry(guild, interaction.user.id, senderName);
  const receiver = getEntry(guild, target.id, targetName);

  if (sender.size - amount < 1) {
    await interaction.reply({ content: `❌ Нельзя отдать больше чем есть! У тебя **${sender.size} см**, минимум 1 см должен остаться.`, ephemeral: true });
    return;
  }

  sender.size -= amount;
  receiver.size += amount;
  saveData(data);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xFF69B4)
        .setTitle("🎁 Подарок доставлен!")
        .setDescription(
          `**${senderName}** подарил **${amount} см** → **${targetName}**!\n\n` +
          `📏 ${senderName}: **${sender.size} см** 📉\n` +
          `📏 ${targetName}: **${receiver.size} см** 📈`
        ),
    ],
  });
}

// ─── /compare ─────────────────────────────────────────────────────────────────

export async function handleCompare(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) { await interaction.reply({ content: "Только на сервере!", ephemeral: true }); return; }
  const target = interaction.options.getUser("кого", true);
  const myName = displayName(interaction);
  const targetMember = interaction.guild?.members.cache.get(target.id);
  const targetName = targetMember?.displayName ?? target.displayName;

  const data = loadData();
  const guild = getGuild(data, interaction.guildId);
  const me = getEntry(guild, interaction.user.id, myName);
  const them = getEntry(guild, target.id, targetName);

  const maxSize = Math.max(me.size, them.size, 1);
  const myBar = sizeBar(me.size, maxSize);
  const theirBar = sizeBar(them.size, maxSize);
  const diff = me.size - them.size;
  const verdict = diff > 0 ? `🏆 **${myName}** побеждает на **+${diff} см**!`
    : diff < 0 ? `🏆 **${targetName}** побеждает на **+${Math.abs(diff)} см**!`
    : "🤝 Полная ничья — одинаковые размеры!";

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle("🔍 Сравнение агрегатов")
        .setDescription(
          `**${myName}** — **${me.size} см**\n\`${myBar}\`\n\n` +
          `**${targetName}** — **${them.size} см**\n\`${theirBar}\`\n\n` +
          verdict
        ),
    ],
  });
}

// ─── /rank ────────────────────────────────────────────────────────────────────

export async function handleRank(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) { await interaction.reply({ content: "Только на сервере!", ephemeral: true }); return; }
  const myName = displayName(interaction);
  const data = loadData();
  const guild = getGuild(data, interaction.guildId);
  const me = getEntry(guild, interaction.user.id, myName);

  const sorted = Object.entries(guild)
    .map(([uid, d]) => ({ uid, size: d.size }))
    .sort((a, b) => b.size - a.size);
  const pos = sorted.findIndex((e) => e.uid === interaction.user.id) + 1;
  const total = sorted.length;
  const percentile = total > 1 ? Math.round((1 - (pos - 1) / (total - 1)) * 100) : 100;

  const medal = pos === 1 ? "👑" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : `#${pos}`;
  const above = sorted[pos - 2];
  const below = sorted[pos];
  const hints = [
    above ? `⬆️ До **${guild[above.uid]?.username ?? "???"}** не хватает **${above.size - me.size} см**` : "⬆️ Ты на вершине!",
    below ? `⬇️ Впереди **${guild[below.uid]?.username ?? "???"}** на **${me.size - below.size} см**` : "⬇️ Ты в самом низу по одному!",
  ].join("\n");

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xF1C40F)
        .setTitle(`${medal} Твоё место в рейтинге`)
        .setDescription(
          `**${myName}** — **${me.size} см**\n` +
          `Позиция: **${pos} из ${total}** (топ ${percentile}%)\n\n${hints}`
        ),
    ],
    ephemeral: true,
  });
}

// ─── /roulette ────────────────────────────────────────────────────────────────

export async function handleRoulette(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) { await interaction.reply({ content: "Только на сервере!", ephemeral: true }); return; }
  const stake = interaction.options.getInteger("ставка", true);
  const myName = displayName(interaction);

  const data = loadData();
  const guild = getGuild(data, interaction.guildId);
  const me = getEntry(guild, interaction.user.id, myName);

  if (stake < 1) { await interaction.reply({ content: "❌ Ставка минимум 1 см!", ephemeral: true }); return; }
  if (me.size - stake < 1) {
    await interaction.reply({ content: `❌ Слишком большая ставка! У тебя **${me.size} см**, минимум 1 должен остаться.`, ephemeral: true });
    return;
  }

  const segments = ["🔴", "⚫", "🔴", "⚫", "🔴", "⚫", "🟢", "🔴", "⚫", "🔴"];
  const spin = segments[Math.floor(Math.random() * segments.length)];
  const win = spin === "🟢" ? "jackpot" : (Math.random() < 0.5 ? "win" : "loss");

  let result: string;
  let color: number;
  if (win === "jackpot") {
    me.size += stake * 3;
    result = `🎰 **ДЖЕКПОТ!** Зелёное! Выигрываешь **x3 = +${stake * 3} см**!\n📏 Итого: **${me.size} см**`;
    color = 0x57F287;
  } else if (win === "win") {
    me.size += stake;
    result = `✅ Повезло! Выигрываешь **+${stake} см**!\n📏 Итого: **${me.size} см**`;
    color = 0x57F287;
  } else {
    me.size = Math.max(1, me.size - stake);
    result = `❌ Не повезло! Теряешь **-${stake} см**!\n📏 Итого: **${me.size} см**`;
    color = 0xED4245;
  }

  saveData(data);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(color)
        .setTitle(`🎰 Рулетка — ${spin}`)
        .setDescription(`**${myName}** ставит **${stake} см**\n\n${result}`)
        .setFooter({ text: "Зелёный (1 из 10) = x3 джекпот!" }),
    ],
  });
}

// ─── /steal ───────────────────────────────────────────────────────────────────

export async function handleSteal(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) { await interaction.reply({ content: "Только на сервере!", ephemeral: true }); return; }
  const target = interaction.options.getUser("цель", true);
  if (target.id === interaction.user.id) { await interaction.reply({ content: "❌ Нельзя воровать у самого себя!", ephemeral: true }); return; }
  if (target.bot) { await interaction.reply({ content: "❌ У ботов нечего красть!", ephemeral: true }); return; }

  const myName = displayName(interaction);
  const targetMember = interaction.guild?.members.cache.get(target.id);
  const targetName = targetMember?.displayName ?? target.displayName;

  const data = loadData();
  const guild = getGuild(data, interaction.guildId);
  const me = getEntry(guild, interaction.user.id, myName);
  const them = getEntry(guild, target.id, targetName);

  const success = Math.random() < 0.4;

  if (success) {
    const stolen = Math.max(1, Math.floor(them.size * (0.1 + Math.random() * 0.2)));
    them.size = Math.max(1, them.size - stolen);
    me.size += stolen;
    saveData(data);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle("🗡️ Кража удалась!")
          .setDescription(
            `**${myName}** успешно украл **${stolen} см** у **${targetName}**!\n\n` +
            `📏 ${myName}: **${me.size} см** 📈\n` +
            `📏 ${targetName}: **${them.size} см** 📉`
          ),
      ],
    });
  } else {
    const penalty = Math.max(1, Math.floor(me.size * (0.05 + Math.random() * 0.1)));
    me.size = Math.max(1, me.size - penalty);
    saveData(data);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle("🚨 Поймали на краже!")
          .setDescription(
            `**${myName}** пытался украсть у **${targetName}**, но попался!\n` +
            `Потерял **${penalty} см** в качестве наказания.\n\n` +
            `📏 ${myName}: **${me.size} см** 📉`
          ),
      ],
    });
  }
}

// ─── /potion ──────────────────────────────────────────────────────────────────

export async function handlePotion(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) { await interaction.reply({ content: "Только на сервере!", ephemeral: true }); return; }
  const myName = displayName(interaction);

  const data = loadData();
  const guild = getGuild(data, interaction.guildId);
  const me = getEntry(guild, interaction.user.id, myName);

  if (!hoursAgo(me.lastPotion, 48)) {
    const next = new Date(new Date(me.lastPotion).getTime() + 48 * 3_600_000);
    const diffMs = next.getTime() - Date.now();
    const hours = Math.floor(diffMs / 3_600_000);
    const mins = Math.floor((diffMs % 3_600_000) / 60_000);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle("🧪 Зелье ещё не готово!")
          .setDescription(`Следующее зелье через **${hours}ч ${mins}м**.`),
      ],
      ephemeral: true,
    });
    return;
  }

  const potions = [
    { name: "🟢 Эликсир роста",      fn: (s: number) => s * 2,                    desc: (s: number, ns: number) => `Размер **удвоен**! ${s} → **${ns} см** 🚀` },
    { name: "🔴 Яд усыхания",        fn: (s: number) => Math.max(1, Math.floor(s / 2)), desc: (s: number, ns: number) => `Размер **уполовинен**! ${s} → **${ns} см** 💀` },
    { name: "💛 Зелье роста",        fn: (s: number) => s + 50,                   desc: (s: number, ns: number) => `**+50 см**! ${s} → **${ns} см** 📈` },
    { name: "🟣 Зелье сжатия",       fn: (s: number) => Math.max(1, s - 30),      desc: (s: number, ns: number) => `**-30 см**! ${s} → **${ns} см** 📉` },
    { name: "🔵 Зелье мегароста",    fn: (s: number) => s + 100,                  desc: (s: number, ns: number) => `**+100 см МЕГАРОСТ**! ${s} → **${ns} см** 🌟` },
    { name: "⚪ Зелье случайности",  fn: (s: number) => Math.max(1, s + Math.floor(Math.random() * 201) - 100), desc: (s: number, ns: number) => `Случайный эффект! ${s} → **${ns} см** 🎲` },
    { name: "🟠 Зелье силы",         fn: (s: number) => Math.floor(s * 1.5),      desc: (s: number, ns: number) => `**x1.5**! ${s} → **${ns} см** 💪` },
    { name: "⚫ Зелье тьмы",         fn: (s: number) => Math.max(1, Math.floor(s * 0.3)), desc: (s: number, ns: number) => `Поглощено тьмой! ${s} → **${ns} см** 👻` },
  ];

  const potion = potions[Math.floor(Math.random() * potions.length)]!;
  const oldSize = me.size;
  me.size = potion.fn(me.size);
  me.lastPotion = new Date().toISOString();
  saveData(data);

  const gained = me.size - oldSize;
  const color = gained >= 0 ? 0x57F287 : 0xED4245;

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(color)
        .setTitle(`🧪 ${potion.name}`)
        .setDescription(
          `**${myName}** выпивает зелье...\n\n${potion.desc(oldSize, me.size)}`
        )
        .setFooter({ text: "Следующее зелье через 48 часов" }),
    ],
  });
}

// ─── /tournament ──────────────────────────────────────────────────────────────

const activeTournaments = new Map<string, Set<string>>();

export async function handleTournament(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) { await interaction.reply({ content: "Только на сервере!", ephemeral: true }); return; }

  if (activeTournaments.has(interaction.guildId)) {
    await interaction.reply({ content: "❌ Турнир уже идёт! Нажми кнопку участия.", ephemeral: true });
    return;
  }

  const hostName = displayName(interaction);
  const participants = new Set<string>([interaction.user.id]);
  activeTournaments.set(interaction.guildId, participants);

  const joinBtn = new ButtonBuilder()
    .setCustomId("tournament_join")
    .setLabel("⚔️ Участвовать!")
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn);

  const makeEmbed = (names: string[]) =>
    new EmbedBuilder()
      .setColor(0xF1C40F)
      .setTitle("🏆 Турнир агрегатов — Набор участников!")
      .setDescription(
        `**${hostName}** открывает турнир!\n\n` +
        `👥 Участников: **${names.length}/8**\n` +
        names.map((n, i) => `${i + 1}. ${n}`).join("\n") + "\n\n" +
        `Нажми кнопку чтобы вступить. Турнир начнётся через 45 секунд!`
      )
      .setFooter({ text: "Минимум 2 участника для старта" });

  const data = loadData();
  const guild = getGuild(data, interaction.guildId);
  const hostEntry = getEntry(guild, interaction.user.id, hostName);

  await interaction.reply({ embeds: [makeEmbed([hostName])], components: [row] });
  const msg = await interaction.fetchReply();

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.customId === "tournament_join",
    time: 45_000,
  });

  collector.on("collect", async (btn: ButtonInteraction) => {
    const pSet = activeTournaments.get(interaction.guildId!);
    if (!pSet) return;
    if (pSet.has(btn.user.id)) {
      await btn.reply({ content: "Ты уже в турнире!", ephemeral: true });
      return;
    }
    if (pSet.size >= 8) {
      await btn.reply({ content: "❌ Мест больше нет (максимум 8)!", ephemeral: true });
      return;
    }
    pSet.add(btn.user.id);
    const freshData = loadData();
    const freshGuild = getGuild(freshData, interaction.guildId!);
    const freshEntry = getEntry(freshGuild, btn.user.id,
      btn.member instanceof GuildMember ? btn.member.displayName : btn.user.displayName);
    const names = [...pSet].map((uid) => freshGuild[uid]?.username ?? "???");
    await btn.update({ embeds: [makeEmbed(names)], components: [row] });
  });

  collector.on("end", async () => {
    const pSet = activeTournaments.get(interaction.guildId!);
    activeTournaments.delete(interaction.guildId!);

    if (!pSet || pSet.size < 2) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x99AAB5)
            .setTitle("❌ Турнир отменён")
            .setDescription("Недостаточно участников (минимум 2)."),
        ],
        components: [],
      });
      return;
    }

    // Run tournament brackets
    const freshData = loadData();
    const freshGuild = getGuild(freshData, interaction.guildId!);
    let players = [...pSet];
    const log: string[] = [];

    while (players.length > 1) {
      const next: string[] = [];
      const shuffled = players.sort(() => Math.random() - 0.5);
      for (let i = 0; i + 1 < shuffled.length; i += 2) {
        const aId = shuffled[i]!;
        const bId = shuffled[i + 1]!;
        const aEntry = getEntry(freshGuild, aId, freshGuild[aId]?.username ?? "???");
        const bEntry = getEntry(freshGuild, bId, freshGuild[bId]?.username ?? "???");
        const stake = Math.max(1, Math.floor(Math.min(aEntry.size, bEntry.size) * 0.25));
        const aWins = Math.random() < 0.5;
        if (aWins) {
          aEntry.size += stake;
          bEntry.size = Math.max(1, bEntry.size - stake);
          next.push(aId);
          log.push(`⚔️ **${aEntry.username}** побил **${bEntry.username}** (ставка ${stake} см)`);
        } else {
          bEntry.size += stake;
          aEntry.size = Math.max(1, aEntry.size - stake);
          next.push(bId);
          log.push(`⚔️ **${bEntry.username}** побил **${aEntry.username}** (ставка ${stake} см)`);
        }
      }
      if (shuffled.length % 2 !== 0) {
        const bye = shuffled[shuffled.length - 1]!;
        next.push(bye);
        log.push(`🎟️ **${freshGuild[bye]?.username ?? "???"}** проходит автоматически`);
      }
      players = next;
    }

    saveData(freshData);
    const winnerId = players[0]!;
    const winner = freshGuild[winnerId];

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xF1C40F)
          .setTitle("🏆 Турнир завершён!")
          .setDescription(
            `**Победитель: 👑 ${winner?.username ?? "???"}** (${winner?.size ?? "?"} см)\n\n` +
            `**Ход боёв:**\n${log.join("\n")}`
          ),
      ],
      components: [],
    });
  });
}

// ─── /allIn ───────────────────────────────────────────────────────────────────

export async function handleAllIn(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) { await interaction.reply({ content: "Только на сервере!", ephemeral: true }); return; }
  const target = interaction.options.getUser("соперник", true);
  if (target.id === interaction.user.id) { await interaction.reply({ content: "❌ Нельзя играть ва-банк с собой!", ephemeral: true }); return; }
  if (target.bot) { await interaction.reply({ content: "❌ Боты не играют в ва-банк!", ephemeral: true }); return; }

  await interaction.deferReply();
  const myName = displayName(interaction);
  const targetMember = interaction.guild?.members.cache.get(target.id);
  const targetName = targetMember?.displayName ?? target.displayName;

  const data = loadData();
  const guild = getGuild(data, interaction.guildId);
  const me = getEntry(guild, interaction.user.id, myName);
  const them = getEntry(guild, target.id, targetName);

  if (me.size < 2 || them.size < 2) {
    await interaction.editReply("❌ Оба игрока должны иметь минимум 2 см!");
    return;
  }

  const acceptBtn = new ButtonBuilder().setCustomId("allin_accept").setLabel("💀 Принять ВА-БАНК").setStyle(ButtonStyle.Danger);
  const declineBtn = new ButtonBuilder().setCustomId("allin_decline").setLabel("🏳️ Отказаться").setStyle(ButtonStyle.Secondary);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(acceptBtn, declineBtn);

  const myStake = me.size - 1;
  const theirStake = them.size - 1;

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle("💀 ВА-БАНК — Всё на кону!")
        .setDescription(
          `**${myName}** бросает вызов **${target}** — ВА-БАНК!\n\n` +
          `💰 **${myName}** ставит **${myStake} см**\n` +
          `💰 **${targetName}** ставит **${theirStake} см**\n\n` +
          `Победитель забирает **ВСЁ**!\n${target}, ты принимаешь?`
        )
        .setFooter({ text: "Вызов истекает через 60 секунд • Шанс 50/50" }),
    ],
    components: [row],
  });

  const msg = await interaction.fetchReply();
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.customId === "allin_accept" || i.customId === "allin_decline",
    time: 60_000,
    max: 1,
  });

  collector.on("collect", async (btn: ButtonInteraction) => {
    if (btn.user.id !== target.id) {
      await btn.reply({ content: "❌ Это не твой вызов!", ephemeral: true });
      return;
    }
    if (btn.customId === "allin_decline") {
      await btn.update({
        embeds: [new EmbedBuilder().setColor(0x99AAB5).setTitle("🏳️ Вызов отклонён").setDescription(`**${targetName}** испугался ва-банка! 🐔`)],
        components: [],
      });
      return;
    }

    const freshData = loadData();
    const freshGuild = getGuild(freshData, interaction.guildId!);
    const freshMe = getEntry(freshGuild, interaction.user.id, myName);
    const freshThem = getEntry(freshGuild, target.id, targetName);
    const myFinalStake = freshMe.size - 1;
    const theirFinalStake = freshThem.size - 1;

    const iWin = Math.random() < 0.5;
    const meBefore = freshMe.size;
    const themBefore = freshThem.size;

    if (iWin) {
      freshMe.size += theirFinalStake;
      freshThem.size = 1;
    } else {
      freshThem.size += myFinalStake;
      freshMe.size = 1;
    }
    saveData(freshData);

    const winner = iWin ? myName : targetName;
    const loser = iWin ? targetName : myName;
    const prize = iWin ? theirFinalStake : myFinalStake;

    await btn.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0xF1C40F)
          .setTitle("💀 ВА-БАНК — РЕЗУЛЬТАТ!")
          .setDescription(
            `👑 **${winner}** ПОБЕДИЛ и забрал **${prize} см** у **${loser}**!\n\n` +
            `📏 ${myName}: ${meBefore} → **${freshMe.size} см** ${iWin ? "📈" : "💀"}\n` +
            `📏 ${targetName}: ${themBefore} → **${freshThem.size} см** ${!iWin ? "📈" : "💀"}`
          ),
      ],
      components: [],
    });
  });

  collector.on("end", async (collected) => {
    if (collected.size === 0) {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0x99AAB5).setTitle("⏰ Вызов истёк").setDescription(`**${targetName}** не ответил.`)],
        components: [],
      });
    }
  });
}

// ─── /dickset (только администратор) ─────────────────────────────────────────

export async function handleDickSet(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Команда доступна только на сервере!", ephemeral: true });
    return;
  }

  // Проверяем права администратора
  const member = interaction.member instanceof GuildMember ? interaction.member : null;
  if (!member?.permissions.has("Administrator")) {
    await interaction.reply({ content: "❌ Только администраторы могут использовать эту команду!", ephemeral: true });
    return;
  }

  const target = interaction.options.getUser("пользователь", true);
  const amount = interaction.options.getInteger("размер", true);

  const targetMember = interaction.guild?.members.cache.get(target.id);
  const targetName = targetMember?.displayName ?? target.displayName;

  const data = loadData();
  const guild = getGuild(data, interaction.guildId);
  const entry = getEntry(guild, target.id, targetName);

  const oldSize = entry.size;
  entry.size = Math.max(1, amount);
  saveData(data);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle("🔧 Размер изменён (Админ)")
        .setDescription(
          `📏 **${targetName}**: ${oldSize} см → **${entry.size} см**`
        )
        .setFooter({ text: `Изменил: ${interaction.user.displayName}` }),
    ],
    ephemeral: true,
  });
}
