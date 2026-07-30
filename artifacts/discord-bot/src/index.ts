import {
  Client,
  GatewayIntentBits,
  Events,
  Message,
  TextChannel,
  Collection,
  Attachment,
  AttachmentBuilder,
  REST,
  Routes,
  Interaction,
  InteractionType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActivityType,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
  ComponentType,
} from "discord.js";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ai, geminiText, geminiGenerateImage, geminiEditImage, openrouterChat, MODEL_CHAT, type OpenRouterMessage } from "./ai.js";
import { commands } from "./commands/index.js";
import { handleTrivia } from "./games/trivia.js";
import { handleQuest } from "./games/quest.js";
import { handleRiddle } from "./games/riddle.js";
import { handleDuel } from "./games/duel.js";
import { handleFortune } from "./games/fortune.js";
import { handleCrocodile } from "./games/crocodile.js";
import { handleMostLikely } from "./games/mostlikely.js";
import { handleTruthOrLie } from "./games/truthorlie.js";
import {
  handleSummary,
  handleTranslate,
  handleCode,
  handleExplain,
  handleFact,
  handleJoke,
} from "./utils/index.js";
import { handleRetell } from "./utils/retell.js";
import {
  handlePoll,
  handleWelcome,
  handlePersona,
  onMemberJoin,
  getSystemPrompt,
  PERSONAS,
} from "./admin/index.js";
import { handleAutomod, checkAndModerate } from "./admin/automod.js";
import {
  handleRoleCreate,
  handleRoleDelete,
  handleRoleEdit,
  handleRoleGive,
  handleRoleTake,
  handleRoleList,
} from "./admin/roles.js";
import { autoRoleGuilds, assignAutoRole, setAutoRole, assignRolesToAll } from "./admin/autorole.js";
import { stopGame, getActiveGame } from "./games/registry.js";
import { handleMeme, handleComic, handleAvatar } from "./creative/index.js";
import {
  handleDick, handleFight, handleDickTop, handleDickSet,
  handleGift, handleCompare, handleRank, handleRoulette,
  handleSteal, handlePotion, handleTournament, handleAllIn,
} from "./games/dick.js";
import {
  handleVerdict, handleRoast, handleMedal, handleVibeCheck,
  handleCompatibility, handlePair, handleMarry, handleAnon, handleNews,
} from "./social/index.js";
import { handleChallenge } from "./games/challenge.js";
import { handleContest } from "./games/contest.js";
import { handleMafia } from "./games/mafia.js";
import {
  handleBalance, handleTop, handleTransfer, handleDaily,
  handleStockList, handleStockCreate, handleStockBuy, handleStockSell, handleStockInfo,
  handleEconomyConfig, handleAdminGive, handleMessageReward,
} from "./economy/index.js";
import {
  isGuildActivated,
  activateGuild,
  generateCodes,
  deactivateGuild,
  listActivatedGuilds,
} from "./activation.js";

// ─── ENV ────────────────────────────────────────────────────────────────────

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN!;
if (!DISCORD_BOT_TOKEN) { console.error("DISCORD_BOT_TOKEN is not set!"); process.exit(1); }

const BOT_OWNER_ID = process.env.BOT_OWNER_ID ?? "";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const MAX_HISTORY = 20;
const TYPING_INTERVAL = 8000;
const BOT_STATUS_FILE =
  process.env.BOT_STATUS_FILE ??
  (process.cwd().includes(`${path.sep}artifacts${path.sep}`)
    ? path.resolve(process.cwd(), "../../.bot-status.json")
    : path.resolve(process.cwd(), ".bot-status.json"));
const BOT_STARTED_AT = new Date().toISOString();

const conversationHistory = new Collection<string, { role: "user" | "model"; text: string }[]>();

const SYSTEM_PROMPT = `Ты — умный и дружелюбный ИИ-ассистент в Discord сервере. 
Ты отвечаешь на вопросы, помогаешь с задачами, участвуешь в разговорах.
Когда тебе присылают фотографию — ты анализируешь и описываешь что видишь.
Ты умеешь создавать и редактировать изображения по запросу.
На сервере есть мини-игры: /trivia, /quest, /crocodile, /mostlikely, /truthorlie, /riddle, /duel, /fortune.
Ты общаешься естественно, как обычный участник чата. 
Отвечай на том языке, на котором к тебе обращаются.
Держи ответы краткими и по делу, если не просят развёрнутого объяснения.
ВАЖНО: Никогда не используй LaTeX-форматирование ($$...$$, $...$, \frac, \alpha и т.д.). Discord не поддерживает LaTeX. Пиши формулы и математику обычным текстом: например "α = 180° × (n-2) / n" вместо LaTeX.`;

const IMAGE_GEN_KEYWORDS = [
  "нарисуй", "нарисовать", "создай изображение", "создай картинку", "создай фото",
  "сгенерируй", "сгенерировать", "генерируй", "сделай изображение", "сделай картинку",
  "draw", "generate image", "create image", "make image", "paint", "imagine",
];

const IMAGE_EDIT_KEYWORDS = [
  "отредактируй", "измени фото", "измени картинку", "отредактируй фото",
  "преврати", "добавь на фото", "убери с фото", "поменяй фон", "измени стиль",
  "edit image", "edit photo", "modify image", "change image", "transform",
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function isImageGenerationRequest(text: string) {
  const lower = text.toLowerCase();
  return IMAGE_GEN_KEYWORDS.some((kw) => lower.includes(kw));
}

function isImageEditRequest(text: string) {
  const lower = text.toLowerCase();
  return IMAGE_EDIT_KEYWORDS.some((kw) => lower.includes(kw));
}

function mimeToExtension(mimeType: string) {
  return ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" })[mimeType] ?? "png";
}

function splitMessage(text: string, maxLength = 1900): string[] {
  if (text.length <= maxLength) return [text];
  const chunks: string[] = [];
  let current = "";
  for (const line of text.split("\n")) {
    if ((current + "\n" + line).length > maxLength) {
      if (current) chunks.push(current.trim());
      current = line;
    } else {
      current = current ? current + "\n" + line : line;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

async function replyWithCommandError(interaction: ChatInputCommandInteraction, error: unknown) {
  const message = error instanceof Error ? error.message : "Неизвестная ошибка";
  const content = `❌ Ошибка команды: ${message}`;

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(content);
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  } catch (replyError) {
    console.error("Failed to send command error response:", replyError);
  }
}

async function fetchImageAsBase64(attachment: Attachment): Promise<{ data: string; mimeType: string } | null> {
  try {
    const ct = attachment.contentType ?? "";
    if (!SUPPORTED_IMAGE_TYPES.has(ct) || attachment.size > MAX_IMAGE_SIZE) return null;
    const res = await fetch(attachment.url);
    if (!res.ok) return null;
    return { data: Buffer.from(await res.arrayBuffer()).toString("base64"), mimeType: ct };
  } catch { return null; }
}

async function generateTextResponse(
  channelId: string,
  username: string,
  userMessage: string,
  images: { data: string; mimeType: string }[],
  guildId?: string
): Promise<string> {
  if (!conversationHistory.has(channelId)) conversationHistory.set(channelId, []);
  const history = conversationHistory.get(channelId)!;

  const historyText = userMessage
    ? `[${username}]: ${userMessage}${images.length ? ` [изображений: ${images.length}]` : ""}`
    : `[${username}]: [изображение]`;
  history.push({ role: "user", text: historyText });
  if (history.length > MAX_HISTORY * 2) history.splice(0, 2);

  const messages: OpenRouterMessage[] = history.slice(0, -1).map((h) => ({
    role: h.role === "model" ? "assistant" : "user",
    content: h.text,
  }));

  const userText = userMessage ? `[${username}]: ${userMessage}` : `[${username}]: Что на этом изображении?`;

  if (images.length > 0) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: userText },
        ...images.map((img) => ({
          type: "image_url" as const,
          image_url: { url: `data:${img.mimeType};base64,${img.data}` },
        })),
      ],
    });
  } else {
    messages.push({ role: "user", content: userText });
  }

  try {
    const text = await openrouterChat(messages, getSystemPrompt(guildId), MODEL_CHAT);
    const finalResponse = text || "Не могу ответить прямо сейчас.";
    history.push({ role: "model", text: finalResponse });
    return finalResponse;
  } catch (error) {
    history.pop();
    throw error;
  }
}

// ─── SLASH COMMAND: /help ─────────────────────────────────────────────────────

// ─── HELP CATEGORIES ─────────────────────────────────────────────────────────

const HELP_CATEGORIES: Record<string, { emoji: string; label: string; description: string; color: number; commands: string[] }> = {
  ai: {
    emoji: "💬",
    label: "Чат и ИИ",
    description: "Общение с ИИ, картинки, анализ фото",
    color: 0x5865F2,
    commands: [
      "`/ask <вопрос>` — задать любой вопрос ИИ",
      "`/imagine <описание>` — создать изображение по описанию",
      "`/clear` — очистить историю разговора в канале",
      "",
      "**Через упоминание @бот:**",
      "• Просто напиши — и бот ответит в разговоре",
      "• Прикрепи фото — бот опишет что видит",
      "• `нарисуй ...` — создать изображение",
      "• Фото + `измени ...` — редактирование картинки",
    ],
  },
  tools: {
    emoji: "🛠️",
    label: "Полезные инструменты",
    description: "Переводчик, код, резюме, факты",
    color: 0x57F287,
    commands: [
      "`/summary [кол-во]` — 📋 Краткое резюме последних сообщений",
      "`/translate <текст> [язык]` — 🌐 Перевод на любой язык",
      "`/code <задача> [язык]` — 💻 Написать код по описанию",
      "`/explain <тема> [уровень]` — 📚 Объяснить просто",
      "`/fact [тема]` — 🌍 Интересный факт",
      "`/joke [тема] [стиль]` — 😄 Анекдот или шутка",
    ],
  },
  dick: {
    emoji: "🍆",
    label: "Агрегат-игры",
    description: "Измерение, бои, рулетка, турниры",
    color: 0xFF69B4,
    commands: [
      "`/dick` — 🍆 Ежедневный замер агрегата (кулдаун 24 ч)",
      "`/fight @user <ставка>` — ⚔️ Битва агрегатами",
      "`/top` — 🏆 Топ агрегатов сервера",
      "`/rank` — 📊 Моё место в рейтинге",
      "`/compare @user` — 🔍 Сравнение с другим игроком",
      "`/gift @user <см>` — 🎁 Подарить сантиметры",
      "`/steal @user` — 🗡️ Украсть агрегат (40% шанс)",
      "`/roulette <ставка>` — 🎰 Рулетка (шанс x3 джекпот)",
      "`/potion` — 🧪 Случайное зелье (кулдаун 48 ч)",
      "`/tournament` — 🏆 Открыть турнир агрегатов",
      "`/allin @user` — 💀 Ва-банк — победитель забирает всё",
      "`/dickset @user <см>` — 🔧 Установить размер (только admin)",
    ],
  },
  games: {
    emoji: "🎮",
    label: "Мини-игры",
    description: "Викторины, RPG, крокодил, дуэли",
    color: 0xFEE75C,
    commands: [
      "`/trivia [тема] [кол-во]` — 🧠 Викторина A/B/C/D",
      "`/quest [тема] [события]` — ⚔️ RPG-приключение, весь чат голосует",
      "`/crocodile [тема]` — 🐊 Один описывает — все угадывают",
      "`/mostlikely [раунды]` — 🎯 Кто скорее всего...",
      "`/truthorlie [тема] [раунды]` — 🃏 Найди ложь среди правды",
      "`/riddle` — 🔮 Загадка от ИИ, 60 сек на ответ",
      "`/duel @user` — ⚡ Дуэль — ИИ рассудит",
      "`/fortune` — 🔮 Предсказание судьбы",
      "`/stop` — 🛑 Остановить игру или трансляцию",
    ],
  },
  creative: {
    emoji: "🎨",
    label: "Творчество",
    description: "Мемы, комиксы, аватарки",
    color: 0xEB459E,
    commands: [
      "`/meme <описание>` — 😂 Мем с картинкой от ИИ",
      "`/comic <сценарий>` — 📖 Мини-комикс из 3 панелей",
      "`/avatar <описание> [стиль]` — 🖼️ Аватарка для профиля",
    ],
  },
  admin: {
    emoji: "🛡️",
    label: "Управление сервером",
    description: "Модерация, приветствия, персона",
    color: 0xED4245,
    commands: [
      "`/automod включить/выключить/статус` — 🛡️ Авто-модерация",
      "`/welcome включить/выключить/тест` — 👋 Авто-приветствие",
      "`/persona <стиль>` — 🎭 Сменить личность бота",
      "`/poll <вопрос> [варианты]` — 📊 Голосование",
    ],
  },
  autorole: {
    emoji: "✨",
    label: "Авто-роли",
    description: "Уникальные ИИ-роли для новых участников",
    color: 0x9B59B6,
    commands: [
      "`/autorole включить` — ✨ Включить авто-выдачу уникальных ролей",
      "`/autorole выключить` — ❌ Выключить авто-выдачу",
      "`/autorole статус` — 📊 Проверить статус",
      "`/autorole выдать-всем` — 🎭 Выдать роли всем участникам у кого их нет",
      "",
      "Когда включено — каждый новый участник получает уникальную роль,",
      "придуманную ИИ специально для него (например: **Страж Вечности**, **Дитя Бури**)",
    ],
  },
  roles: {
    emoji: "🎨",
    label: "Управление ролями",
    description: "Создание, редактирование, выдача ролей",
    color: 0xE67E22,
    commands: [
      "`/role-create <название> [цвет]` — 🎨 Создать новую роль",
      "`/role-delete <роль>` — 🗑️ Удалить роль",
      "`/role-edit <роль> [название] [цвет]` — ✏️ Изменить роль",
      "`/role-give <участник> <роль>` — ✅ Выдать роль участнику",
      "`/role-take <участник> <роль>` — 🚫 Забрать роль у участника",
      "`/role-list` — 📋 Показать все роли сервера",
    ],
  },
  voice: {
    emoji: "📡",
    label: "Голос и трансляция",
    description: "Воспроизведение аудио из YouTube",
    color: 0x99AAB5,
    commands: [
      "`/broadcast <ссылка>` — 📡 Воспроизвести YouTube-видео в голосовом канале",
      "`/stop` — ⏹️ Остановить трансляцию и выйти из канала",
      "",
      "⚠️ Бот должен быть в голосовом канале. Убедись, что у бота есть права Connect и Speak.",
    ],
  },
  social: {
    emoji: "🎭",
    label: "Социальное",
    description: "Приговоры, roast, медали, совместимость",
    color: 0xE91E63,
    commands: [
      "`/приговор @участник` — ⚖️ ИИ выносит абсурдный приговор",
      "`/roast @участник` — 🔥 ИИ жёстко (по-доброму) подкалывает",
      "`/медаль @участник [причина]` — 🏅 Торжественная церемония награждения",
      "`/аватар-вайб [@участник]` — 🔮 Анализ ауры и вайба",
      "`/совместимость @user1 @user2` — 💘 Совместимость двух участников",
      "`/пара` — 💕 Случайная пара дня на сервере (с общей ролью)",
      "`/поженить @user1 @user2` — 💍 Поженить двух участников с общей ролью",
      "`/анон <сообщение>` — 🕵️ Анонимное сообщение в канал",
      "`/новости` — 📰 Абсурдные ИИ-новости про сервер",
    ],
  },
  newgames: {
    emoji: "🎲",
    label: "Новые игры",
    description: "Испытания, конкурсы, Мафия",
    color: 0x9B59B6,
    commands: [
      "`/испытание` — ⚡ ИИ придумывает задание для всего чата",
      "`/конкурс <тема> [время]` — 🏆 Конкурс с ИИ-судьёй",
      "`/мафия` — 🎭 Классическая Мафия прямо в Discord",
    ],
  },
};

function buildOverviewEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle("🤖 SWAGAgpt.AI — Справка")
    .setDescription(
      "Выбери категорию в меню ниже, чтобы увидеть команды.\n\n" +
      Object.entries(HELP_CATEGORIES)
        .map(([, c]) => `${c.emoji} **${c.label}** — ${c.description}`)
        .join("\n")
    )
    .setFooter({ text: "Работаю на Gemini AI • /help для справки в любое время" });
}

function buildCategoryEmbed(key: string) {
  const cat = HELP_CATEGORIES[key];
  if (!cat) return buildOverviewEmbed();
  return new EmbedBuilder()
    .setColor(cat.color)
    .setTitle(`${cat.emoji} ${cat.label}`)
    .setDescription(cat.commands.join("\n"))
    .setFooter({ text: "← Выбери другую категорию в меню ниже" });
}

function buildSelectMenu() {
  const select = new StringSelectMenuBuilder()
    .setCustomId("help_category")
    .setPlaceholder("📚 Выбери категорию команд...")
    .addOptions(
      Object.entries(HELP_CATEGORIES).map(([key, cat]) =>
        new StringSelectMenuOptionBuilder()
          .setValue(key)
          .setLabel(`${cat.emoji} ${cat.label}`)
          .setDescription(cat.description)
      )
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

async function handleHelp(interaction: ChatInputCommandInteraction) {
  const row = buildSelectMenu();
  await interaction.reply({
    embeds: [buildOverviewEmbed()],
    components: [row],
  });

  const msg = await interaction.fetchReply();
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.StringSelect,
    filter: (i) => i.customId === "help_category",
    time: 120_000,
  });

  collector.on("collect", async (i) => {
    const key = i.values[0] ?? "ai";
    await i.update({
      embeds: [buildCategoryEmbed(key)],
      components: [buildSelectMenu()],
    });
  });

  collector.on("end", async () => {
    await interaction.editReply({ components: [] }).catch(() => {});
  });
}

// ─── SLASH COMMAND: /ask ─────────────────────────────────────────────────────

async function handleAsk(interaction: ChatInputCommandInteraction) {
  const question = interaction.options.getString("вопрос", true);
  await interaction.deferReply();
  try {
    const response = await generateTextResponse(interaction.channelId, interaction.user.username, question, [], interaction.guildId ?? undefined);
    const chunks = splitMessage(response);
    await interaction.editReply(chunks[0]);
    for (let i = 1; i < chunks.length; i++) await interaction.channel?.send(chunks[i]);
  } catch {
    await interaction.editReply("Упс, что-то пошло не так. Попробуй ещё раз! 😅");
  }
}

// ─── SLASH COMMAND: /imagine ──────────────────────────────────────────────────

async function handleImagine(interaction: ChatInputCommandInteraction) {
  const prompt = interaction.options.getString("описание", true);
  await interaction.deferReply();
  try {
    const result = await geminiGenerateImage(prompt);
    if (result) {
      const ext = mimeToExtension(result.mimeType);
      await interaction.editReply({
        content: `🎨 **${prompt}**`,
        files: [new AttachmentBuilder(result.buffer, { name: `generated.${ext}` })],
      });
    } else {
      await interaction.editReply("Не смог создать изображение. Попробуй описать по-другому!");
    }
  } catch {
    await interaction.editReply("Ошибка при создании изображения. Попробуй ещё раз!");
  }
}

// ─── SLASH COMMAND: /stop ────────────────────────────────────────────────────

async function handleStop(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;

  // Stop voice broadcast if active in this guild
  if (guildId) {
    try {
      const { getActiveGuildId, stopBroadcast } = await import("./voice.js");
      if (getActiveGuildId() === guildId) {
        stopBroadcast(guildId);
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0x99AAB5)
              .setTitle("⏹️ Трансляция остановлена")
              .setDescription("Воспроизведение аудио остановлено, бот вышел из голосового канала.")
              .setFooter({ text: `Остановлено: ${interaction.user.displayName}` }),
          ],
        });
        return;
      }
    } catch (error) {
      console.warn("[Voice] Stop check skipped:", error instanceof Error ? error.message : error);
    }
  }

  // Otherwise stop game
  const active = getActiveGame(interaction.channelId);
  if (!active) {
    await interaction.reply({
      content: "❌ В этом канале нет активного ивента или трансляции.",
      ephemeral: true,
    });
    return;
  }
  const stopped = stopGame(interaction.channelId);
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x99AAB5)
        .setTitle("🛑 Ивент остановлен")
        .setDescription(`**${stopped}** был принудительно остановлен в этом канале.`)
        .setFooter({ text: `Остановлено: ${interaction.user.displayName}` }),
    ],
  });
}

// ─── SLASH COMMAND: /broadcast ────────────────────────────────────────────────

async function handleBroadcast(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: "❌ Эта команда работает только на сервере.", ephemeral: true });
    return;
  }

  const member = interaction.guild.members.cache.get(interaction.user.id)
    ?? await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

  const voiceChannel = member?.voice.channel;
  if (!voiceChannel) {
    await interaction.reply({
      content: "❌ Сначала зайди в голосовой канал, затем используй /broadcast.",
      ephemeral: true,
    });
    return;
  }

  const url = interaction.options.getString("ссылка", true).trim();

  await interaction.deferReply();

  try {
    const { startBroadcast } = await import("./voice.js");
    await startBroadcast(voiceChannel, interaction.channel!, url);
    // startBroadcast sends its own status messages
    await interaction.deleteReply().catch(() => {});
  } catch (error: unknown) {
    console.error("Broadcast error:", error);
    const message = error instanceof Error ? error.message : "Неизвестная ошибка";
    await interaction.editReply(`❌ Ошибка при запуске трансляции: ${message}`);
  }
}

// ─── SLASH COMMAND: /clear ────────────────────────────────────────────────────

async function handleClear(interaction: ChatInputCommandInteraction) {
  const had = conversationHistory.has(interaction.channelId);
  conversationHistory.delete(interaction.channelId);
  await interaction.reply({
    content: had ? "✅ История разговора очищена!" : "История и так пуста 😊",
    ephemeral: true,
  });
}

// ─── SLASH COMMAND: /activate ────────────────────────────────────────────────

async function handleActivate(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "❌ Команда доступна только на серверах.", ephemeral: true });
    return;
  }

  const code = interaction.options.getString("код", true).trim().toUpperCase();
  const result = activateGuild(guildId, code, interaction.user.id, interaction.user.displayName);

  if (result === "already_active") {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle("✅ Сервер уже активирован")
          .setDescription("Этот сервер уже использует SWAGAgpt.AI! Все команды доступны.")
          .setFooter({ text: "Используй /help чтобы увидеть все команды" }),
      ],
      ephemeral: true,
    });
    return;
  }

  if (result === "invalid_code") {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle("❌ Неверный код активации")
          .setDescription(
            `Код \`${code}\` не найден или уже использован.\n\n` +
            "Убедись что код написан правильно.\n" +
            "Коды имеют формат: `SWAG-XXXXXX-XXXXXX`"
          ),
      ],
      ephemeral: true,
    });
    return;
  }

  if (result === "code_used") {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle("❌ Код уже использован")
          .setDescription("Этот код активации уже был использован на другом сервере."),
      ],
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle("🎉 Сервер успешно активирован!")
        .setDescription(
          "SWAGAgpt.AI теперь полностью активирован на этом сервере!\n\n" +
          "Все команды разблокированы. Используй `/help` чтобы увидеть что умеет бот."
        )
        .addFields(
          { name: "🔑 Код", value: `\`${code}\``, inline: true },
          { name: "👤 Активировал", value: interaction.user.displayName, inline: true },
        )
        .setFooter({ text: "Добро пожаловать в SWAGAgpt.AI!" }),
    ],
  });
}

// ─── SLASH COMMAND: /gencode ──────────────────────────────────────────────────

async function handleGenCode(interaction: ChatInputCommandInteraction) {
  if (!BOT_OWNER_ID || interaction.user.id !== BOT_OWNER_ID) {
    await interaction.reply({ content: "❌ Только владелец бота может генерировать коды.", ephemeral: true });
    return;
  }

  const count = interaction.options.getInteger("количество") ?? 1;
  const codes = generateCodes(count);

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`🔑 Сгенерировано ${codes.length} кодов активации`)
        .setDescription(
          "Передай эти коды администраторам серверов, которые хотят использовать бота.\n" +
          "Каждый код можно использовать только **один раз** на одном сервере.\n\n" +
          codes.map((c) => `\`${c}\``).join("\n")
        )
        .setFooter({ text: "Коды сохранены. Используй /gencode чтобы создать ещё." }),
    ],
    ephemeral: true,
  });
}

// ─── SLASH COMMAND: /deactivate ───────────────────────────────────────────────

async function handleDeactivate(interaction: ChatInputCommandInteraction) {
  if (!BOT_OWNER_ID || interaction.user.id !== BOT_OWNER_ID) {
    await interaction.reply({ content: "❌ Только владелец бота может деактивировать серверы.", ephemeral: true });
    return;
  }

  const targetGuildId = interaction.options.getString("сервер", true).trim();
  const success = deactivateGuild(targetGuildId);

  await interaction.reply({
    content: success
      ? `✅ Сервер \`${targetGuildId}\` деактивирован.`
      : `❌ Сервер \`${targetGuildId}\` не найден в списке активированных.`,
    ephemeral: true,
  });
}

// ─── SLASH COMMAND: /autorole ─────────────────────────────────────────────────

async function handleAutoRoleCommand(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) {
    return interaction.reply({ content: "Только для серверов!", ephemeral: true });
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "включить") {
    setAutoRole(guildId, true);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x9b59b6)
          .setTitle("✨ Авто-роли включены!")
          .setDescription(
            "Теперь каждый новый участник сервера получит **уникальную роль**, придуманную ИИ специально для него.\n\n" +
            "Роль создаётся автоматически при входе — с оригинальным названием и случайным цветом."
          )
          .setFooter({ text: "Отключить: /autorole выключить" }),
      ],
    });
  } else if (sub === "выключить") {
    setAutoRole(guildId, false);
    await interaction.reply({
      content: "✅ Авто-выдача уникальных ролей отключена.",
      ephemeral: true,
    });
  } else if (sub === "статус") {
    const enabled = autoRoleGuilds.get(guildId) ?? false;
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(enabled ? 0x2ecc71 : 0x95a5a6)
          .setTitle("🎲 Статус авто-ролей")
          .setDescription(
            enabled
              ? "✅ **Включено** — новые участники получают уникальные ИИ-роли при входе."
              : "❌ **Выключено** — роли не выдаются."
          ),
      ],
      ephemeral: true,
    });
  } else if (sub === "выдать-всем") {
    if (!interaction.guild) {
      return interaction.reply({ content: "Только для серверов!", ephemeral: true });
    }

    await interaction.deferReply();

    const statusMsg = await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x9b59b6)
          .setTitle("⏳ Выдаю роли...")
          .setDescription("Ищу участников без ролей и придумываю им уникальные титулы. Это может занять некоторое время."),
      ],
    });

    let lastUpdate = Date.now();

    const { assigned, skipped } = await assignRolesToAll(
      interaction.guild,
      async (done, total, last) => {
        if (Date.now() - lastUpdate > 3000) {
          lastUpdate = Date.now();
          await interaction.editReply({
            embeds: [
              new EmbedBuilder()
                .setColor(0x9b59b6)
                .setTitle("⏳ Выдаю роли...")
                .setDescription(`Прогресс: **${done}/${total}**\nПоследний: ${last}`),
            ],
          }).catch(() => {});
        }
      }
    );

    void statusMsg;

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle("✅ Готово!")
          .setDescription(
            `Роли выданы:\n\n` +
            `✨ **Получили роль:** ${assigned} участников\n` +
            `⏭️ **Пропущено** (уже есть роли / боты): ${skipped}`
          )
          .setFooter({ text: "Каждая роль придумана ИИ индивидуально" }),
      ],
    });
  }
}

// ─── CLIENT ──────────────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

function writeBotStatus(status: "online" | "offline") {
  const payload = {
    online: status === "online",
    status,
    botTag: client.user?.tag ?? "SWAGAgpt.AI#7648",
    botId: client.user?.id ?? null,
    guildCount: client.guilds.cache.size,
    lastHeartbeat: new Date().toISOString(),
    startedAt: BOT_STARTED_AT,
    uptimeSeconds: Math.floor(process.uptime()),
  };

  try {
    mkdirSync(path.dirname(BOT_STATUS_FILE), { recursive: true });
    writeFileSync(BOT_STATUS_FILE, JSON.stringify(payload, null, 2));
  } catch (error) {
    console.error("Failed to write bot status:", error);
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Discord бот запущен как ${readyClient.user.tag}`);
  console.log(`Подключён к ${readyClient.guilds.cache.size} серверам`);
  writeBotStatus("online");
  setInterval(() => writeBotStatus("online"), 15_000);
  const statuses = [
    { name: "🎮 /trivia /quest /duel", type: ActivityType.Playing },
    { name: "funpay.com/users/11974380/", type: ActivityType.Watching },
  ];
  let statusIndex = 0;
  readyClient.user.setActivity(statuses[statusIndex]);
  setInterval(() => {
    statusIndex = (statusIndex + 1) % statuses.length;
    readyClient.user.setActivity(statuses[statusIndex]);
  }, 15_000);

  // Auto-activate guilds that were connected before the activation system was introduced
  const alreadyActivated = listActivatedGuilds();
  if (Object.keys(alreadyActivated).length === 0) {
    for (const guild of readyClient.guilds.cache.values()) {
      activateGuild(guild.id, "LEGACY-GRANT", "SYSTEM", "System");
      console.log(`[Activation] Auto-activated existing guild: ${guild.name} (${guild.id})`);
    }
  }

  const rest = new REST().setToken(DISCORD_BOT_TOKEN);
  const body = commands.map((c) => c.toJSON());
  try {
    await rest.put(Routes.applicationCommands(readyClient.user.id), { body });
    for (const guild of readyClient.guilds.cache.values()) {
      await rest.put(Routes.applicationGuildCommands(readyClient.user.id, guild.id), { body });
      console.log(`Slash-команды зарегистрированы для: ${guild.name}`);
    }
  } catch (error) {
    console.error("Ошибка регистрации команд:", error);
  }
});

client.on(Events.GuildCreate, () => writeBotStatus("online"));
client.on(Events.GuildDelete, () => writeBotStatus("online"));

// ─── SLASH COMMANDS ───────────────────────────────────────────────────────────

const EXEMPT_COMMANDS = new Set(["help", "activate", "gencode", "deactivate"]);

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (interaction.type !== InteractionType.ApplicationCommand) return;
  if (!interaction.isChatInputCommand()) return;

  try {
    const { commandName } = interaction;

    // ── Activation gate ──────────────────────────────────────────────────────
    if (!EXEMPT_COMMANDS.has(commandName)) {
      const guildId = interaction.guildId;
      if (guildId && !isGuildActivated(guildId)) {
        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle("🔒 Бот не активирован")
              .setDescription(
                "SWAGAgpt.AI ещё не активирован на этом сервере.\n\n" +
                "**Как активировать:**\n" +
                "1. Получи код активации у создателя бота\n" +
                "2. Введи `/activate <код>` (нужны права управления сервером)\n\n" +
                "Команда `/help` доступна без активации."
              )
              .setFooter({ text: "По вопросам активации обратитесь к владельцу бота" }),
          ],
          ephemeral: true,
        });
        return;
      }
    }

    if (commandName === "help") return handleHelp(interaction);
  if (commandName === "ask") return handleAsk(interaction);
  if (commandName === "imagine") return handleImagine(interaction);
  if (commandName === "clear") return handleClear(interaction);
  if (commandName === "stop") return handleStop(interaction);
  // Utility
  if (commandName === "summary") return handleSummary(interaction);
  if (commandName === "translate") return handleTranslate(interaction);
  if (commandName === "code") return handleCode(interaction);
  if (commandName === "explain") return handleExplain(interaction);
  if (commandName === "fact") return handleFact(interaction);
  if (commandName === "joke") return handleJoke(interaction);
  if (commandName === "пересказ") return handleRetell(interaction);
  // Games
  if (commandName === "trivia") return handleTrivia(interaction);
  if (commandName === "quest") return handleQuest(interaction);
  if (commandName === "riddle") return handleRiddle(interaction);
  if (commandName === "duel") return handleDuel(interaction);
  if (commandName === "fortune") return handleFortune(interaction);
  if (commandName === "crocodile") return handleCrocodile(interaction);
  if (commandName === "mostlikely") return handleMostLikely(interaction);
  if (commandName === "truthorlie") return handleTruthOrLie(interaction);
  // Server management
  if (commandName === "poll") return handlePoll(interaction);
  if (commandName === "welcome") return handleWelcome(interaction);
  if (commandName === "persona") return handlePersona(interaction);
  if (commandName === "automod") return handleAutomod(interaction);
  // Creative
  if (commandName === "meme") return handleMeme(interaction);
  if (commandName === "comic") return handleComic(interaction);
  if (commandName === "avatar") return handleAvatar(interaction);
  // Dick game
  if (commandName === "dick") return handleDick(interaction);
  if (commandName === "fight") return handleFight(interaction);
  if (commandName === "top") return handleDickTop(interaction);
  if (commandName === "dickset") return handleDickSet(interaction);
  // Dick game — new commands
  if (commandName === "gift") return handleGift(interaction);
  if (commandName === "compare") return handleCompare(interaction);
  if (commandName === "rank") return handleRank(interaction);
  if (commandName === "roulette") return handleRoulette(interaction);
  if (commandName === "steal") return handleSteal(interaction);
  if (commandName === "potion") return handlePotion(interaction);
  if (commandName === "tournament") return handleTournament(interaction);
  if (commandName === "allin") return handleAllIn(interaction);
  // Voice / Broadcast
  if (commandName === "broadcast") return handleBroadcast(interaction);
  // Activation
  if (commandName === "activate") return handleActivate(interaction);
  if (commandName === "gencode") return handleGenCode(interaction);
  if (commandName === "deactivate") return handleDeactivate(interaction);
  // Roles
  if (commandName === "role-create") return handleRoleCreate(interaction);
  if (commandName === "role-delete") return handleRoleDelete(interaction);
  if (commandName === "role-edit") return handleRoleEdit(interaction);
  if (commandName === "role-give") return handleRoleGive(interaction);
  if (commandName === "role-take") return handleRoleTake(interaction);
  if (commandName === "role-list") return handleRoleList(interaction);
  if (commandName === "autorole") return handleAutoRoleCommand(interaction);
  // Social
  if (commandName === "приговор") return handleVerdict(interaction);
  if (commandName === "roast") return handleRoast(interaction);
  if (commandName === "медаль") return handleMedal(interaction);
  if (commandName === "аватар-вайб") return handleVibeCheck(interaction);
  if (commandName === "совместимость") return handleCompatibility(interaction);
  if (commandName === "пара") return handlePair(interaction);
  if (commandName === "поженить") return handleMarry(interaction);
  if (commandName === "анон") return handleAnon(interaction);
  if (commandName === "новости") return handleNews(interaction);
  // New games
  if (commandName === "испытание") return handleChallenge(interaction);
  if (commandName === "конкурс") return handleContest(interaction);
  if (commandName === "мафия") return handleMafia(interaction);

  // ── ТРАНСКРИПЦИЯ ───────────────────────────────────────────────────────────
  if (commandName === "транскрипция") {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId!;

    if (sub === "стоп") {
      await interaction.deferReply({ ephemeral: true });
      const { stopTranscription } = await import("./transcribe.js");
      const stopped = await stopTranscription(guildId);
      await interaction.editReply(stopped ? "✅ Транскрипция остановлена." : "❌ Транскрипция не была запущена.");
      return;
    }

    if (sub === "старт") {
      await interaction.deferReply({ ephemeral: true });
      const { startTranscription, isTranscribing } = await import("./transcribe.js");

      if (isTranscribing(guildId)) {
        await interaction.editReply("❌ Транскрипция уже запущена. Используй `/транскрипция стоп` чтобы остановить.");
        return;
      }

      // Resolve voice channel: explicit option or caller's current channel
      const channelOpt = interaction.options.getChannel("канал");
      let voiceChannel = channelOpt as import("discord.js").VoiceBasedChannel | null;

      if (!voiceChannel) {
        const member = interaction.member as import("discord.js").GuildMember | null;
        voiceChannel = member?.voice?.channel ?? null;
      }

      if (!voiceChannel) {
        await interaction.editReply("❌ Ты не находишься в голосовом канале. Зайди в голосовой канал или укажи его через опцию `канал`.");
        return;
      }

      const textChannel = interaction.channel as import("discord.js").TextChannel;
      if (!textChannel) {
        await interaction.editReply("❌ Не удалось определить текстовый канал для вывода транскрипций.");
        return;
      }

      try {
        await startTranscription(voiceChannel, textChannel);
        await interaction.editReply(`✅ Транскрипция запущена! Слушаю **${voiceChannel.name}** и пишу сюда.`);
      } catch (err) {
        await interaction.editReply(`❌ ${(err as Error).message}`);
      }
      return;
    }
  }

  // ── ЭКОНОМИКА ──────────────────────────────────────────────────────────────
  if (commandName === "баланс") return handleBalance(interaction);
  if (commandName === "топ-богачей") return handleTop(interaction);
  if (commandName === "ежедневный") return handleDaily(interaction);
  if (commandName === "перевести") return handleTransfer(interaction);
  if (commandName === "дать-монеты") return handleAdminGive(interaction);
  if (commandName === "конфиг-монеты") return handleEconomyConfig(interaction);
    if (commandName === "акции") {
      const sub = interaction.options.getSubcommand();
      if (sub === "список") return handleStockList(interaction);
      if (sub === "создать") return handleStockCreate(interaction);
      if (sub === "купить") return handleStockBuy(interaction);
      if (sub === "продать") return handleStockSell(interaction);
      if (sub === "инфо") return handleStockInfo(interaction);
    }
  } catch (error) {
    console.error("Command handler error:", error);
    await replyWithCommandError(interaction, error);
  }
});

// ─── MESSAGE HANDLER (mention-based chat) ─────────────────────────────────────

client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot) return;

  // Auto-moderation check (profanity + 18+ content)
  checkAndModerate(message).catch(() => {});

  // Passive economy reward for guild messages
  if (message.guild) {
    handleMessageReward(message.guild.id, message.author.id, message.author.username);
  }

  const botUser = client.user;
  if (!botUser) return;

  const isMentioned = message.mentions.has(botUser);
  const isDirectMessage = !message.guild;
  const content = message.content.replace(`<@${botUser.id}>`, "").trim();

  const imageAttachments = message.attachments.filter(
    (a) => a.contentType && SUPPORTED_IMAGE_TYPES.has(a.contentType)
  );
  const hasImages = imageAttachments.size > 0;

  if (!isMentioned && !isDirectMessage) return;

  if (!content && !hasImages) {
    await message.reply("Привет! 👋 Используй `/help` чтобы увидеть все команды и мини-игры!");
    return;
  }

  let typingInterval: ReturnType<typeof setInterval> | null = null;
  const startTyping = async () => {
    try {
      await (message.channel as TextChannel).sendTyping();
      typingInterval = setInterval(async () => {
        try { await (message.channel as TextChannel).sendTyping(); } catch {}
      }, TYPING_INTERVAL);
    } catch {}
  };
  const stopTyping = () => {
    if (typingInterval) { clearInterval(typingInterval); typingInterval = null; }
  };

  try {
    await startTyping();

    // Edit image
    if (hasImages && content && isImageEditRequest(content)) {
      const fetchedImages = (await Promise.all(imageAttachments.map((a) => fetchImageAsBase64(a))))
        .filter((img): img is { data: string; mimeType: string } => img !== null);
      if (fetchedImages.length === 0) {
        stopTyping();
        await message.reply("Не смог загрузить изображение. Попробуй ещё раз! 😅");
        return;
      }
      const result = await geminiEditImage(fetchedImages[0].data, fetchedImages[0].mimeType, content);
      stopTyping();
      if (result) {
        const ext = mimeToExtension(result.mimeType);
        await message.reply({ content: "✅ Готово!", files: [new AttachmentBuilder(result.buffer, { name: `edited.${ext}` })] });
      } else {
        await message.reply("Не смог отредактировать. Попробуй переформулировать запрос!");
      }
      return;
    }

    // Generate image
    if (content && isImageGenerationRequest(content) && !hasImages) {
      const result = await geminiGenerateImage(content);
      stopTyping();
      if (result) {
        const ext = mimeToExtension(result.mimeType);
        await message.reply({ content: "🎨 Держи!", files: [new AttachmentBuilder(result.buffer, { name: `generated.${ext}` })] });
      } else {
        await message.reply("Не смог создать изображение. Попробуй описать по-другому!");
      }
      return;
    }

    // Text response
    const images = hasImages
      ? (await Promise.all(imageAttachments.map((a) => fetchImageAsBase64(a))))
          .filter((img): img is { data: string; mimeType: string } => img !== null)
      : [];

    const response = await generateTextResponse(message.channelId, message.author.username, content, images, message.guildId ?? undefined);
    stopTyping();

    const chunks = splitMessage(response);
    for (let i = 0; i < chunks.length; i++) {
      if (i === 0) await message.reply(chunks[i]);
      else await message.channel.send(chunks[i]);
    }
  } catch (error) {
    stopTyping();
    console.error("Error handling message:", error);
    await message.reply("Упс, что-то пошло не так. Попробуй ещё раз! 😅");
  }
});

// ─── MESSAGE UPDATE (Tenor/Giphy GIF embeds appear here) ──────────────────────

client.on(Events.MessageUpdate, async (_oldMessage, newMessage) => {
  if (newMessage.author?.bot) return;
  if (!newMessage.guild) return;
  // Only process updates that added embeds (Tenor/Giphy GIFs)
  if (!newMessage.embeds || newMessage.embeds.length === 0) return;
  checkAndModerate(newMessage).catch((err) =>
    console.error("AutoMod (messageUpdate) error:", err)
  );
});

// ─── MEMBER JOIN (welcome) ────────────────────────────────────────────────────

client.on(Events.GuildMemberAdd, (member) => {
  onMemberJoin(member).catch((err) => console.error("Welcome handler error:", err));
  assignAutoRole(member).catch((err) => console.error("AutoRole handler error:", err));
});

client.on(Events.Error, (error) => console.error("Discord client error:", error));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  writeBotStatus("offline");
  process.exit(1);
});

process.once("SIGINT", () => {
  writeBotStatus("offline");
  process.exit(0);
});

process.once("SIGTERM", () => {
  writeBotStatus("offline");
  process.exit(0);
});

client.login(DISCORD_BOT_TOKEN).catch((error) => {
  console.error("Failed to login:", error);
  writeBotStatus("offline");
  process.exit(1);
});
