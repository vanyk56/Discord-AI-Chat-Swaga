import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  Message,
  PartialMessage,
  TextChannel,
  PermissionFlagsBits,
} from "discord.js";
import { openrouterRequest, MODEL_UTILS } from "../ai.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ─── PERSISTENT STATE ──────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, "../../automod-state.json");

function loadState(): Map<string, boolean> {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, "utf-8");
      const obj = JSON.parse(raw) as Record<string, boolean>;
      console.log("[AutoMod] Loaded state from disk:", obj);
      return new Map(Object.entries(obj));
    }
  } catch (err) {
    console.error("[AutoMod] Failed to load state:", err);
  }
  return new Map();
}

function saveState(map: Map<string, boolean>): void {
  try {
    const obj = Object.fromEntries(map);
    fs.writeFileSync(STATE_FILE, JSON.stringify(obj, null, 2), "utf-8");
  } catch (err) {
    console.error("[AutoMod] Failed to save state:", err);
  }
}

const automodEnabled: Map<string, boolean> = loadState();

export function isAutomodEnabled(guildId: string): boolean {
  return automodEnabled.get(guildId) ?? false;
}

// ─── PROFANITY LIST ────────────────────────────────────────────────────────────
// NOTE: \b does NOT work with Cyrillic in JS — using plain substring patterns

const RU_PROFANITY = [
  // хуй и производные
  "хуй", "хуе", "хуя", "хуи", "хуё", "хуесос", "хуеплёт",
  "охуе", "охуй", "охуен", "нахуй", "похуй", "дохуя",
  // пизда и производные
  "пизд", "пёзд", "пиздец", "пиздёж", "пиздабол",
  // блядь
  "блядь", "блять", "бляд", "блят", "блядина", "блядво", "бля",
  // ебать
  "ебать", "ёбать", "ебёт", "еблан", "ебло", "ёбло",
  "наеб", "заеб", "выеб", "отеб", "поеб", "ъеб", "ъёб", "ёбан", "ебан",
  // сука
  "сука", "сучк", "сучар",
  // мудак
  "мудак", "мудил", "мудо",
  // дрочить
  "дрочи", "дрочит", "дрочер",
  // сосать и производные (соси, сосёт, сосать, сасити)
  "сосать", "сосёт", "соси", "сосит", "сасит", "сасать",
  // шлюха
  "шлюх", "шлюша",
  // петух (оскорбление)
  "петуш",
  // залупа
  "залупа", "залупн",
  // гандон
  "гандон",
  // другое
  "мандавошк", "мандёж",
  // пидор и производные
  "пидор", "пидр", "пидар", "пидас",
  // фонетические варианты пидараса
  "питарас", "питорас", "пидорас",
  // ублюдок и другие
  "ублюдок", "ублюд",
  // курва
  "курва",
  // говно и производные
  "говно", "говн", "гавно", "гавн",
  // сперма
  "сперм",
  // член (оскорбительный контекст)
  "член",
];

const EN_PROFANITY = [
  "fuck", "fucker", "fucking", "fucked", "fuk", "fuq",
  "shit", "shitting", "shitty",
  "asshole", "jackass",
  "bitch", "bitches",
  "cunt", "cunts",
  "pussy",
  "whore", "whores",
  "slut", "sluts",
  "nigga", "nigg",
  "faggot",
  "wanker",
  "cocksucker",
  "motherfuck",
];

// Таблица замены: латинские символы → кириллические визуальные двойники
const LAT_TO_CYR: Record<string, string> = {
  a: "а", e: "е", o: "о", p: "р", c: "с", x: "х", y: "у",
  b: "в", h: "н", k: "к", m: "м", t: "т", u: "и",
  d: "д", i: "и", r: "р", n: "п", v: "в", j: "й",
  // Заглавные
  A: "А", E: "Е", O: "О", P: "Р", C: "С", X: "Х", Y: "У",
  B: "В", H: "Н", K: "К", M: "М", T: "Т",
  D: "Д", I: "И", R: "Р", N: "П", V: "В", J: "Й",
};

function normalize(text: string): string {
  // π и 3.14 → "пи" (п3.14рас → пидарас)
  // JI/jl/Jl → "л" (bJIЯДИHA → блядина — JI визуально = Л)
  let t = text
    .replace(/π/g, "пи")
    .replace(/3[.,]14/g, "пи")
    .replace(/[Jj][Ii|l]/g, "л")  // JI, Ji, jI, ji, jl, Jl → л
    .replace(/lI|lL|LI/g, "л");   // lI, lL, LI → л (другие варианты Л)

  // Заменяем латинские буквы на кириллические аналоги
  const cyrFixed = t.replace(/[aeocpxybhkmtudirnvjAEOCPXYBHKMTDIRNVJ]/g, (ch) => LAT_TO_CYR[ch] ?? ch);

  return cyrFixed
    .toLowerCase()
    .replace(/@/g, "а")     // @ → а (п@дарас, п@ц@н)
    .replace(/[*#!%^&_\-=+\\\/.,;:'"~`]/g, "") // убираем маскировку символами
    .replace(/0/g, "о")
    .replace(/3/g, "е")
    .replace(/4/g, "ч")
    .replace(/1/g, "и")
    .replace(/6/g, "б")     // 6 → б (лит: 6lock = block)
    .replace(/9/g, "д")     // 9 → д (лит)
    .replace(/\$/g, "с")
    .replace(/\|/g, "л")
    .replace(/[2578]/g, "") // убираем оставшиеся цифры-разделители
    // убираем повторяющиеся буквы (хуууй → хуй)
    .replace(/(.)\1{2,}/g, "$1")
    .replace(/\s+/g, " ");
}

// Нормализация БЕЗ пробелов — ловит обход через "х у й", "п.и.з.д.а" и т.д.
function normalizeNoSpaces(text: string): string {
  return normalize(text).replace(/\s/g, "");
}

// Заменяет в→б в уже нормализованной строке (ловит b→в→б обход типа bJIЯДИHA)
function swapVtoB(normalized: string): string {
  return normalized.replace(/в/g, "б");
}

function checkList(n: string): { found: boolean; word?: string } {
  for (const word of RU_PROFANITY) {
    if (n.includes(word)) return { found: true, word };
  }
  for (const word of EN_PROFANITY) {
    const re = new RegExp(`\\b${word}`, "i");
    if (re.test(n)) return { found: true, word };
  }
  return { found: false };
}

export function containsProfanity(text: string): { found: boolean; word?: string } {
  const n = normalize(text);
  const ns = normalizeNoSpaces(text);
  const variants = [
    n,
    ns,
    swapVtoB(n),   // bлядина → влядина → блядина
    swapVtoB(ns),  // то же без пробелов
  ];
  for (const v of variants) {
    const result = checkList(v);
    if (result.found) return result;
  }
  return { found: false };
}

// ─── 18+ URL DETECTION ─────────────────────────────────────────────────────────

const ADULT_URL_PATTERNS = [
  /pornhub/i, /xvideos/i, /xhamster/i, /redtube/i, /youporn/i,
  /onlyfans/i, /brazzers/i, /bangbros/i, /naughtyamerica/i,
  /nsfw/i, /porn/i, /xxx/i, /sex\.com/i,
];

function containsAdultUrl(text: string): boolean {
  return ADULT_URL_PATTERNS.some((p) => p.test(text));
}

// ─── IMAGE ANALYSIS ───────────────────────────────────────────────────────────

// Кэш результатов: url → { result, expiresAt }
const imageCache = new Map<string, { result: boolean; expiresAt: number }>();
const IMAGE_CACHE_TTL = 10 * 60 * 1000; // 10 минут

// Дедупликация: если URL уже анализируется — ждём результата, не запускаем повторно
const inFlight = new Map<string, Promise<boolean>>();

// Ключ кэша — первые 120 символов URL (достаточно для идентификации)
function urlKey(url: string): string {
  return url.substring(0, 120);
}

async function askGemini(base64: string, mimeType: string): Promise<"да" | "нет" | "error" | "empty"> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [
          {
            text: `You are a content moderator. Look at this image carefully.
Does it contain pornographic or explicit 18+ content such as: exposed genitals, explicit sexual acts, porn, hentai, or erotica?
Answer with exactly one word: "да" (yes) or "нет" (no). No other text.`,
          },
          { inlineData: { data: base64, mimeType } },
        ],
      }],
      config: { maxOutputTokens: 10 },
    });
    const answer = (response.text ?? "").toLowerCase().trim();
    if (answer === "") return "empty";
    if (answer.startsWith("да") || answer.startsWith("yes")) return "да";
    return "нет";
  } catch (err: any) {
    const msg = String(err);
    if (msg.includes("INVALID_ARGUMENT") || msg.includes("400")) return "error";
    // Другие ошибки — возможно safety
    console.warn(`[AutoMod] Gemini exception: ${msg.substring(0, 120)}`);
    return "empty";
  }
}

async function analyzeImage(url: string, mimeType: string): Promise<boolean> {
  const key = urlKey(url);

  // 1. Проверяем кэш
  const cached = imageCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    console.log(`[AutoMod] Cache hit for ${url.substring(0, 60)}: ${cached.result}`);
    return cached.result;
  }

  // 2. Если уже анализируется — ждём того же промиса
  const existing = inFlight.get(key);
  if (existing) {
    console.log(`[AutoMod] Dedup: waiting for in-flight analysis of ${url.substring(0, 60)}`);
    return existing;
  }

  const promise = (async (): Promise<boolean> => {
    try {
      // Загружаем изображение
      const maxSize = 8 * 1024 * 1024; // 8MB
      let res: Response;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12_000);
        res = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
      } catch {
        console.warn(`[AutoMod] Fetch failed: ${url.substring(0, 60)}`);
        return false;
      }

      if (!res.ok) {
        console.warn(`[AutoMod] Fetch ${res.status}: ${url.substring(0, 60)}`);
        return false;
      }

      const buffer = await res.arrayBuffer();
      if (buffer.byteLength === 0 || buffer.byteLength > maxSize) {
        console.warn(`[AutoMod] Bad buffer size (${buffer.byteLength}): ${url.substring(0, 60)}`);
        return false;
      }

      // Проверяем MIME тип
      const contentType = res.headers.get("content-type") ?? mimeType;
      const actualMime = contentType.split(";")[0]!.trim();
      if (!actualMime.startsWith("image/") && !actualMime.startsWith("video/")) {
        console.log(`[AutoMod] Skip non-image "${actualMime}": ${url.substring(0, 60)}`);
        return false;
      }
      const mimeForGemini = actualMime.startsWith("video/") ? "image/gif" : actualMime;

      const base64 = Buffer.from(buffer).toString("base64");

      // До 3 попыток
      let yesCount = 0;
      let noCount = 0;
      let emptyCount = 0;
      const MAX_TRIES = 3;

      for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
        const verdict = await askGemini(base64, mimeForGemini);
        console.log(`[AutoMod] Attempt ${attempt}/${MAX_TRIES} for ${url.substring(0, 60)}: "${verdict}" (${buffer.byteLength} bytes)`);

        if (verdict === "error") {
          // INVALID_ARGUMENT — файл нечитаем, прекращаем
          break;
        }
        if (verdict === "да") {
          yesCount++;
          break; // Одного "да" достаточно
        }
        if (verdict === "нет") {
          noCount++;
          break; // Одного "нет" достаточно — безопасно
        }
        // "empty" — считаем и пробуем ещё раз
        emptyCount++;
        if (attempt < MAX_TRIES) {
          await new Promise(r => setTimeout(r, 600 * attempt));
        }
      }

      // Логика решения:
      // - явное "да" → удалить
      // - явное "нет" → оставить
      // - 3 пустых подряд → safety filter Gemini (явный контент) → удалить
      // - ошибка чтения файла → оставить
      let result: boolean;
      if (yesCount > 0) {
        result = true;
      } else if (noCount > 0) {
        result = false;
      } else if (emptyCount >= MAX_TRIES) {
        // Стабильно пустой ответ = safety filter = 18+
        result = true;
        console.log(`[AutoMod] All ${MAX_TRIES} attempts empty — safety filter confirmed, treating as 18+`);
      } else {
        result = false; // Ошибка чтения или другой случай
      }

      console.log(`[AutoMod] Final verdict for ${url.substring(0, 60)}: ${result ? "🔞 ADULT" : "✅ SAFE"} (yes=${yesCount} no=${noCount} empty=${emptyCount})`);

      // Сохраняем в кэш
      imageCache.set(key, { result, expiresAt: Date.now() + IMAGE_CACHE_TTL });
      return result;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

async function isAdultImage(url: string, mimeType: string): Promise<boolean> {
  try {
    return await analyzeImage(url, mimeType);
  } catch (err) {
    console.error("[AutoMod] isAdultImage error:", err);
    return false;
  }
}

// ─── MAIN MODERATION CHECK ────────────────────────────────────────────────────

const MEDIA_TYPES = new Set([
  "image/gif", "image/jpeg", "image/png", "image/webp",
]);

export async function checkAndModerate(
  message: Message | PartialMessage
): Promise<void> {
  try {
    if (!message.guild) return;
    if (!isAutomodEnabled(message.guild.id)) return;
    if (message.author?.bot) return;

    const fullText = message.content ?? "";
    console.log(`[AutoMod] Checking message from ${message.author?.tag}: "${fullText.substring(0, 80)}"`);

    // 1. Profanity in text
    const { found, word } = containsProfanity(fullText);
    if (found) {
      console.log(`[AutoMod] Profanity found: "${word}" — deleting`);
      await deleteAndWarn(message, "🤬 нецензурная лексика");
      return;
    }

    // 2. Adult URL in text
    if (fullText && containsAdultUrl(fullText)) {
      console.log("[AutoMod] Adult URL found — deleting");
      await deleteAndWarn(message, "🔞 ссылка на 18+ сайт");
      return;
    }

    // 3. Image/GIF attachments
    if (message.attachments && message.attachments.size > 0) {
      for (const [, attachment] of message.attachments) {
        const ct = attachment.contentType?.split(";")[0] ?? "";
        if (!MEDIA_TYPES.has(ct)) continue;
        console.log(`[AutoMod] Checking attachment: ${attachment.url.substring(0, 60)}`);
        const adult = await isAdultImage(attachment.url, ct);
        if (adult) {
          await deleteAndWarn(message, "🔞 изображение/GIF 18+");
          return;
        }
      }
    }

    // 4. Embeds (Tenor/Giphy GIFs come via messageUpdate as embeds)
    if (message.embeds && message.embeds.length > 0) {
      for (const embed of message.embeds) {
        const checkUrl = embed.url ?? "";

        // Fast URL check
        if (containsAdultUrl(checkUrl)) {
          await deleteAndWarn(message, "🔞 ссылка на 18+ контент");
          return;
        }

        // Analyze embedded image
        const imgUrl =
          embed.image?.url ??
          embed.thumbnail?.url ??
          embed.video?.proxyURL ??
          embed.thumbnail?.proxyURL;

        if (!imgUrl) continue;

        const isGifEmbed =
          imgUrl.includes(".gif") ||
          checkUrl.includes("tenor.com") ||
          checkUrl.includes("giphy.com") ||
          embed.type === "gifv";

        if (isGifEmbed) {
          console.log(`[AutoMod] Checking GIF embed: ${imgUrl.substring(0, 60)}`);
          const adult = await isAdultImage(imgUrl, "image/gif");
          if (adult) {
            await deleteAndWarn(message, "🔞 GIF 18+");
            return;
          }
        }
      }
    }
  } catch (err) {
    console.error("[AutoMod] checkAndModerate error:", err);
  }
}

async function deleteAndWarn(
  message: Message | PartialMessage,
  reason: string
): Promise<void> {
  try {
    await message.delete();
    console.log(`[AutoMod] ✅ Deleted message. Reason: ${reason}`);
  } catch (err) {
    console.error("[AutoMod] ❌ Failed to delete message (missing Manage Messages permission?):", err);
    return;
  }

  try {
    const warning = await (message.channel as TextChannel).send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle("🛡️ Сообщение удалено")
          .setDescription(
            `Сообщение **${message.author?.displayName ?? "пользователя"}** было удалено.\n**Причина:** ${reason}`
          )
          .setFooter({ text: "Соблюдай правила сервера!" }),
      ],
    });
    setTimeout(() => warning.delete().catch(() => {}), 5000);
  } catch (err) {
    console.error("[AutoMod] Failed to send warning:", err);
  }
}

// ─── COMMAND HANDLER ──────────────────────────────────────────────────────────

export async function handleAutomod(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  if (!guildId) {
    await interaction.reply({ content: "Эта команда доступна только на серверах.", ephemeral: true });
    return;
  }

  // Check user permissions
  const member = interaction.member;
  const hasPerms =
    member &&
    typeof member.permissions !== "string" &&
    member.permissions.has(PermissionFlagsBits.ManageMessages);

  if (!hasPerms) {
    await interaction.reply({
      content: "❌ Нужно право **Управление сообщениями** для этой команды.",
      ephemeral: true,
    });
    return;
  }

  if (sub === "включить") {
    automodEnabled.set(guildId, true);
    saveState(automodEnabled);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle("🛡️ Авто-модерация включена")
          .setDescription(
            "Бот будет автоматически удалять:\n" +
            "• 🤬 Нецензурную лексику (RU/EN)\n" +
            "• 🔞 Изображения и GIF с 18+ контентом\n" +
            "• 🔗 Ссылки на 18+ сайты\n\n" +
            "⚠️ **Важно:** у бота должно быть право **Управление сообщениями** в настройках сервера!\n\n" +
            "Используй `/automod выключить` чтобы отключить."
          )
          .setFooter({ text: `Включено: ${interaction.user.displayName}` }),
      ],
    });
  } else if (sub === "выключить") {
    automodEnabled.set(guildId, false);
    saveState(automodEnabled);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle("🛡️ Авто-модерация выключена")
          .setDescription("Автоматическая фильтрация отключена.")
          .setFooter({ text: `Выключено: ${interaction.user.displayName}` }),
      ],
    });
  } else if (sub === "статус") {
    const enabled = isAutomodEnabled(guildId);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(enabled ? 0x57F287 : 0x99AAB5)
          .setTitle("🛡️ Авто-модерация — Статус")
          .setDescription(
            enabled
              ? "✅ **Включена** — удаляет мат и 18+ контент."
              : "❌ **Выключена** — используй `/automod включить` для активации."
          ),
      ],
      ephemeral: true,
    });
  }
}
