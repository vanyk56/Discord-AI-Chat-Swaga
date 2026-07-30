import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  TextChannel,
  Message,
  codeBlock,
} from "discord.js";
import { geminiText, geminiJSON } from "../ai.js";

// ─── /summary ────────────────────────────────────────────────────────────────

export async function handleSummary(interaction: ChatInputCommandInteraction) {
  const count = Math.min(interaction.options.getInteger("количество") ?? 30, 100);
  await interaction.deferReply();

  const channel = interaction.channel as TextChannel;
  if (!channel) {
    await interaction.editReply("Не могу получить сообщения из этого канала.");
    return;
  }

  let messages: Message[];
  try {
    const fetched = await channel.messages.fetch({ limit: count });
    messages = [...fetched.values()]
      .filter((m) => !m.author.bot || m.author.id !== interaction.client.user?.id)
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  } catch {
    await interaction.editReply("Не смог получить сообщения. Проверь права бота!");
    return;
  }

  if (messages.length === 0) {
    await interaction.editReply("В этом канале нет сообщений для суммаризации.");
    return;
  }

  const transcript = messages
    .map((m) => `[${m.author.username}]: ${m.content || (m.attachments.size > 0 ? "[вложение]" : "[пусто]")}`)
    .join("\n");

  try {
    const summary = await geminiText(
      `Вот последние ${messages.length} сообщений из Discord канала:\n\n${transcript}\n\n` +
      `Сделай краткое и структурированное резюме этого разговора. ` +
      `Выдели основные темы и ключевые моменты. ` +
      `Отвечай на том же языке, на котором идёт разговор. ` +
      `Не перечисляй каждое сообщение — дай общую картину.`
    );

    const embed = new EmbedBuilder()
      .setColor(0x4CC9F0)
      .setTitle(`📋 Краткое резюме — последние ${messages.length} сообщений`)
      .setDescription(summary.substring(0, 4000))
      .setFooter({ text: `Канал: #${channel.name} • Суммаризовано ИИ` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch {
    await interaction.editReply("Не смог суммаризовать. Попробуй ещё раз!");
  }
}

// ─── /translate ───────────────────────────────────────────────────────────────

export async function handleTranslate(interaction: ChatInputCommandInteraction) {
  const text = interaction.options.getString("текст", true);
  const targetLang = interaction.options.getString("язык") ?? "английский";
  await interaction.deferReply();

  interface TranslationResult {
    detected_language: string;
    translated: string;
    romanization?: string;
  }

  try {
    const result = await geminiJSON<TranslationResult>(
      `Переведи следующий текст на язык: "${targetLang}".
Текст: "${text}"
Верни JSON:
{
  "detected_language": "определённый язык оригинала",
  "translated": "переведённый текст",
  "romanization": "романизация если язык не латинский (иначе null)"
}`
    );

    const embed = new EmbedBuilder()
      .setColor(0x6BCB77)
      .setTitle("🌐 Перевод")
      .addFields(
        { name: `🔤 Оригинал (${result.detected_language})`, value: text.substring(0, 1024) },
        { name: `✅ Перевод (${targetLang})`, value: result.translated.substring(0, 1024) },
      );

    if (result.romanization) {
      embed.addFields({ name: "🔡 Романизация", value: result.romanization.substring(0, 512) });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch {
    await interaction.editReply("Не смог перевести текст. Попробуй ещё раз!");
  }
}

// ─── /code ────────────────────────────────────────────────────────────────────

const SUPPORTED_LANGS = [
  "python", "javascript", "typescript", "java", "c++", "c#", "go", "rust",
  "php", "swift", "kotlin", "sql", "bash", "html", "css",
];

export async function handleCode(interaction: ChatInputCommandInteraction) {
  const task = interaction.options.getString("задача", true);
  const lang = interaction.options.getString("язык") ?? "python";
  await interaction.deferReply();

  interface CodeResult {
    code: string;
    explanation: string;
    language: string;
  }

  try {
    const result = await geminiJSON<CodeResult>(
      `Напиши код на языке "${lang}" для следующей задачи: "${task}"
Верни JSON:
{
  "language": "название языка для блока кода (строчными, например: python, javascript)",
  "code": "только код без лишних комментариев, готовый к запуску",
  "explanation": "краткое объяснение что делает код (2-3 предложения)"
}
Код должен быть рабочим, читаемым и следовать лучшим практикам.`
    );

    const codeStr = codeBlock(result.language, result.code.substring(0, 1800));

    const embed = new EmbedBuilder()
      .setColor(0xF72585)
      .setTitle(`💻 Код на ${lang}`)
      .setDescription(`**Задача:** ${task}`)
      .addFields({ name: "💡 Объяснение", value: result.explanation.substring(0, 1024) });

    // Discord has 2000 char limit per message, use reply + followup for code
    await interaction.editReply({ embeds: [embed], content: codeStr });
  } catch {
    await interaction.editReply("Не смог написать код. Попробуй переформулировать задачу!");
  }
}

// ─── /explain ─────────────────────────────────────────────────────────────────

export async function handleExplain(interaction: ChatInputCommandInteraction) {
  const topic = interaction.options.getString("тема", true);
  const level = interaction.options.getString("уровень") ?? "просто";
  await interaction.deferReply();

  interface ExplainResult {
    title: string;
    explanation: string;
    analogy: string;
    fun_fact: string;
  }

  try {
    const levelMap: Record<string, string> = {
      "просто": "объясни как пятилетнему ребёнку, максимально просто и понятно",
      "средне": "объясни понятно для школьника или обычного человека без специальных знаний",
      "сложно": "объясни для специалиста, используй технические термины и детали",
    };

    const result = await geminiJSON<ExplainResult>(
      `Объясни тему "${topic}". Уровень: ${levelMap[level] ?? levelMap["просто"]}.
Верни JSON:
{
  "title": "название темы (кратко)",
  "explanation": "объяснение темы (3-5 предложений)",
  "analogy": "простая аналогия или пример из жизни",
  "fun_fact": "интересный или неожиданный факт по теме"
}`
    );

    const embed = new EmbedBuilder()
      .setColor(0xFFD93D)
      .setTitle(`📚 ${result.title}`)
      .setDescription(result.explanation.substring(0, 2000))
      .addFields(
        { name: "🔍 Аналогия", value: result.analogy.substring(0, 512) },
        { name: "💡 Интересный факт", value: result.fun_fact.substring(0, 512) },
      )
      .setFooter({ text: `Уровень: ${level}` });

    await interaction.editReply({ embeds: [embed] });
  } catch {
    await interaction.editReply("Не смог объяснить тему. Попробуй ещё раз!");
  }
}

// ─── /fact ────────────────────────────────────────────────────────────────────

export async function handleFact(interaction: ChatInputCommandInteraction) {
  const topic = interaction.options.getString("тема");
  await interaction.deferReply();

  interface FactResult {
    fact: string;
    category: string;
    source_hint: string;
    wow_level: number; // 1-5
  }

  try {
    const result = await geminiJSON<FactResult>(
      `Расскажи ${topic ? `интересный факт о "${topic}"` : "случайный удивительный факт о мире"}.
Факт должен быть необычным, малоизвестным и проверенным.
Верни JSON:
{
  "fact": "сам факт (2-3 предложения, захватывающе и интересно)",
  "category": "категория факта (наука, история, животные, технологии и т.д.)",
  "source_hint": "подсказка откуда это (например: по данным NASA, исследования MIT и т.д.)",
  "wow_level": <уровень удивительности от 1 до 5>
}`
    );

    const wowStars = "⭐".repeat(result.wow_level);
    const categoryEmojis: Record<string, string> = {
      наука: "🔬", история: "📜", животные: "🐾", технологии: "💻",
      космос: "🌌", природа: "🌿", психология: "🧠", математика: "📐",
    };
    const emoji = Object.entries(categoryEmojis).find(([k]) =>
      result.category.toLowerCase().includes(k)
    )?.[1] ?? "🌍";

    const embed = new EmbedBuilder()
      .setColor(0xFF6B35)
      .setTitle(`${emoji} Интересный факт${topic ? ` о ${topic}` : ""}`)
      .setDescription(result.fact.substring(0, 2000))
      .addFields(
        { name: "📂 Категория", value: result.category, inline: true },
        { name: "🌟 Удивительность", value: wowStars, inline: true },
        { name: "📖 Источник", value: result.source_hint, inline: false },
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch {
    await interaction.editReply("Не смог найти факт. Попробуй ещё раз!");
  }
}

// ─── /joke ────────────────────────────────────────────────────────────────────

export async function handleJoke(interaction: ChatInputCommandInteraction) {
  const topic = interaction.options.getString("тема");
  const style = interaction.options.getString("стиль") ?? "обычный";
  await interaction.deferReply();

  interface JokeResult {
    setup: string;
    punchline?: string;
    type: "punchline" | "story" | "oneshot";
  }

  const styleMap: Record<string, string> = {
    "обычный": "обычный смешной анекдот",
    "сухой": "анекдот с сухим юмором (deadpan)",
    "абсурд": "абсурдный или сюрреалистический юмор",
    "умный": "интеллектуальный каламбур или умный юмор",
  };

  try {
    const result = await geminiJSON<JokeResult>(
      `Расскажи ${topic ? `анекдот или шутку на тему "${topic}"` : "смешной анекдот или шутку"}.
Стиль: ${styleMap[style] ?? styleMap["обычный"]}.
Анекдот должен быть по-настоящему смешным, оригинальным и корректным.
Верни JSON:
{
  "setup": "начало анекдота или вся шутка если это однострочник",
  "punchline": "панчлайн/концовка (если это двухчастный анекдот, иначе null)",
  "type": "punchline" | "story" | "oneshot"
}`
    );

    const embed = new EmbedBuilder()
      .setColor(0xC77DFF)
      .setTitle("😄 Анекдот")
      .setDescription(result.setup);

    if (result.punchline && result.type === "punchline") {
      embed.addFields({ name: "🥁 ...", value: `**${result.punchline}**` });
    }

    embed.setFooter({ text: `Стиль: ${style}${topic ? ` • Тема: ${topic}` : ""}` });

    await interaction.editReply({ embeds: [embed] });
  } catch {
    await interaction.editReply("Не смог придумать анекдот. Попробуй ещё раз!");
  }
}
