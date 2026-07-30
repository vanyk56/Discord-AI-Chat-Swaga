import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  TextChannel,
} from "discord.js";
import { geminiJSON } from "../ai.js";
import { registerGame, unregisterGame } from "./registry.js";

interface CrocodileWord {
  word: string;
  category: string;
  forbiddenWords: string[];
}

const activeCrocodile = new Map<string, boolean>();
const GAME_TIME_MS = 90_000;

async function generateWord(topic: string | null): Promise<CrocodileWord> {
  return geminiJSON<CrocodileWord>(
    `Придумай слово или короткую фразу для игры "Крокодил"${topic ? ` на тему: "${topic}"` : ""}.
Оно должно быть интересным, но не слишком сложным.

Верни строго валидный JSON (без markdown):
{
  "word": "слово или фраза которое нужно объяснить",
  "category": "категория: фильм / животное / профессия / место / предмет / еда / и т.д.",
  "forbiddenWords": ["однокоренное слово 1", "синоним 1", "синоним 2"]
}
Запрещённые слова — это слова которые нельзя использовать при объяснении (однокоренные и прямые синонимы).`
  );
}

function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/[.,!?;:'"]/g, "");
}

export async function handleCrocodile(interaction: ChatInputCommandInteraction) {
  const channelId = interaction.channelId;

  if (activeCrocodile.has(channelId)) {
    await interaction.reply({ content: "🐊 В этом канале уже идёт Крокодил!", ephemeral: true });
    return;
  }

  const topic = interaction.options.getString("тема");

  // Show word to describer ephemerally
  await interaction.deferReply({ ephemeral: true });

  let wordData: CrocodileWord;
  try {
    wordData = await generateWord(topic);
  } catch {
    await interaction.editReply("Не смог придумать слово. Попробуй ещё раз!");
    return;
  }

  activeCrocodile.set(channelId, true);

  // Will be assigned after collector is created
  let stopCollector: (() => void) | null = null;
  registerGame(channelId, "Крокодил", () => {
    stopCollector?.();
  });

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🐊 Твоё слово!")
        .addFields(
          { name: "📝 Слово", value: `**${wordData.word}**`, inline: true },
          { name: "📂 Категория", value: wordData.category, inline: true },
          { name: "🚫 Нельзя говорить", value: wordData.forbiddenWords.join(", ") || "—" }
        )
        .setDescription("Описывай это слово в чат! Остальные пытаются угадать.")
        .setFooter({ text: `У вас ${GAME_TIME_MS / 1000} секунд!` }),
    ],
  });

  // Public announcement
  if (!interaction.channel || !(interaction.channel instanceof TextChannel)) {
    activeCrocodile.delete(channelId);
    return;
  }

  const publicMsg = await interaction.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🐊 Крокодил!")
        .setDescription(
          `**${interaction.user.displayName}** получил секретное слово и сейчас будет его описывать!\n\n` +
          `Пишите свои догадки прямо в чат!\n\n` +
          `📂 Категория: **${wordData.category}**`
        )
        .setFooter({ text: `⏳ ${GAME_TIME_MS / 1000} секунд на угадывание!` }),
    ],
  });

  const collector = interaction.channel.createMessageCollector({
    filter: (m) => !m.author.bot && m.author.id !== interaction.user.id,
    time: GAME_TIME_MS,
  });
  stopCollector = () => collector.stop("stopped");

  collector.on("collect", async (m) => {
    const guess = normalize(m.content);
    const answer = normalize(wordData.word);

    if (guess === answer || (answer.includes(" ") && guess === answer)) {
      collector.stop("won");
      await publicMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor(0xffd700)
            .setTitle("🏆 Угадали!")
            .setDescription(
              `**${m.author.displayName}** угадал слово!\n\n` +
              `🐊 Слово было: **${wordData.word}**\n` +
              `🎯 Объяснял: **${interaction.user.displayName}**`
            )
            .setFooter({ text: "Используй /crocodile чтобы сыграть снова!" }),
        ],
      });
      await m.react("🏆").catch(() => {});
    }
  });

  collector.on("end", async (_, reason) => {
    activeCrocodile.delete(channelId);
    unregisterGame(channelId);
    if (reason === "stopped") {
      await publicMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor(0x99aab5)
            .setTitle("🛑 Игра остановлена")
            .setDescription(
              `Крокодил был принудительно остановлен.\n\n` +
              `🐊 Загаданное слово было: **${wordData.word}**`
            )
            .setFooter({ text: "Используй /crocodile чтобы сыграть снова!" }),
        ],
      });
    } else if (reason !== "won") {
      await publicMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle("⏰ Время вышло!")
            .setDescription(
              `Никто не угадал слово **${interaction.user.displayName}**!\n\n` +
              `🐊 Загаданное слово: **${wordData.word}**`
            )
            .setFooter({ text: "Используй /crocodile чтобы сыграть снова!" }),
        ],
      });
    }
  });
}
