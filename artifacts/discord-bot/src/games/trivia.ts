import {
  ChatInputCommandInteraction,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ComponentType,
} from "discord.js";
import { geminiJSON } from "../ai.js";
import { registerGame, unregisterGame } from "./registry.js";

interface TriviaQuestion {
  question: string;
  options: [string, string, string, string];
  correct: number;
  explanation: string;
}

interface TriviaSet {
  title: string;
  questions: TriviaQuestion[];
}

const LABELS = ["🅰️ A", "🅱️ B", "©️ C", "🇩 D"] as const;
const QUESTION_TIME_MS = 30_000;
const REVEAL_PAUSE_MS = 5_000;

async function generateQuestions(topic: string | null, count: number): Promise<TriviaSet> {
  return geminiJSON<TriviaSet>(
    `Придумай ровно ${count} разных интересных вопросов для викторины${topic ? ` на тему: "${topic}"` : ""}.
Верни JSON:
{
  "title": "короткое название викторины",
  "questions": [
    {
      "question": "текст вопроса",
      "options": ["вариант A", "вариант B", "вариант C", "вариант D"],
      "correct": <индекс правильного ответа 0-3>,
      "explanation": "краткое объяснение (1-2 предложения)"
    }
  ]
}
Вопросы должны быть разными по сложности, интересными, варианты — правдоподобными. Ровно ${count} вопросов.`
  );
}

function buildQuestionEmbed(q: TriviaQuestion, index: number, total: number, topic: string | null): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`🧠 Вопрос ${index + 1} из ${total}`)
    .setDescription(`**${q.question}**\n\n*Нажми кнопку с ответом — правильный раскроется после окончания времени!*`)
    .setFooter({ text: `Тема: ${topic ?? "случайная"} • 30 секунд на ответ` });
}

function buildRevealEmbed(
  q: TriviaQuestion,
  index: number,
  total: number,
  answers: Map<string, number>,
  userNames: Map<string, string>
): EmbedBuilder {
  const correctLabel = `${LABELS[q.correct]}: ${q.options[q.correct]}`;
  const correctCount = [...answers.values()].filter((v) => v === q.correct).length;

  const winners = [...answers.entries()]
    .filter(([, v]) => v === q.correct)
    .map(([id]) => `✅ ${userNames.get(id) ?? "???"}`);

  let participantsText: string;
  if (answers.size === 0) {
    participantsText = "Никто не ответил";
  } else if (winners.length === 0) {
    participantsText = `❌ Никто не угадал из ${answers.size}`;
  } else {
    participantsText = winners.slice(0, 10).join("\n");
    if (winners.length > 10) participantsText += `\n...и ещё ${winners.length - 10}`;
  }

  return new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle(`✅ Вопрос ${index + 1} из ${total} — Ответ раскрыт!`)
    .setDescription(`**${q.question}**`)
    .addFields(
      { name: "💡 Правильный ответ", value: correctLabel },
      { name: "📖 Объяснение", value: q.explanation.substring(0, 512) },
      { name: `🎯 Угадали ${correctCount} из ${answers.size}`, value: participantsText.substring(0, 512) },
    );
}

function buildLeaderboard(
  scores: Map<string, number>,
  userNames: Map<string, string>,
  title: string,
  topic: string | null,
  total: number
): EmbedBuilder {
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const medals = ["🥇", "🥈", "🥉"];

  let board: string;
  if (sorted.length === 0) {
    board = "Никто не участвовал 😔";
  } else {
    board = sorted
      .map(([id, score], i) => {
        const medal = medals[i] ?? `${i + 1}.`;
        return `${medal} **${userNames.get(id) ?? "???"}** — ${score} из ${total} правильных`;
      })
      .join("\n");
  }

  const winner = sorted[0];
  const winnerName = winner ? userNames.get(winner[0]) : null;

  return new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle("🏆 Викторина завершена!")
    .addFields(
      { name: "📋 Тема", value: topic ?? "случайная", inline: true },
      { name: "❓ Вопросов", value: `${total}`, inline: true },
      { name: "👥 Участников", value: `${scores.size}`, inline: true },
      { name: "🏆 Таблица лидеров", value: board.substring(0, 1024) },
    )
    .setDescription(winnerName ? `🎉 Победитель: **${winnerName}**!` : null)
    .setFooter({ text: `«${title}» • Спасибо за участие!` });
}

export async function handleTrivia(interaction: ChatInputCommandInteraction) {
  const channelId = interaction.channelId;
  const topic = interaction.options.getString("тема");
  const questionCount = interaction.options.getInteger("количество") ?? 5;

  await interaction.deferReply();
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle("🧠 Генерирую викторину...")
        .setDescription(`Тема: **${topic ?? "случайная"}** • Вопросов: **${questionCount}**\n\nПодождите, ИИ придумывает вопросы...`),
    ],
  });

  let triviaSet: TriviaSet;
  try {
    triviaSet = await generateQuestions(topic, questionCount);
  } catch {
    await interaction.editReply("Не смог создать викторину. Попробуй ещё раз!");
    return;
  }

  // Announce start
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`🧠 Викторина: ${triviaSet.title}`)
        .setDescription(`**${questionCount} вопросов** на тему: **${topic ?? "случайная"}**\n\n⏳ Первый вопрос через 3 секунды...`)
        .setFooter({ text: "Правильный ответ раскрывается после истечения времени каждого вопроса" }),
    ],
  });

  await new Promise((r) => setTimeout(r, 3000));

  const scores = new Map<string, number>();
  const userNames = new Map<string, string>();

  let stopped = false;
  let stopCurrentCollector: (() => void) | null = null;
  registerGame(channelId, "Викторина", () => {
    stopped = true;
    stopCurrentCollector?.();
  });

  for (let qi = 0; qi < triviaSet.questions.length; qi++) {
    if (stopped) break;
    const q = triviaSet.questions[qi];
    const gameId = `${interaction.id}_${qi}`;

    const buttons = q.options.map((opt, i) =>
      new ButtonBuilder()
        .setCustomId(`trivia_${gameId}_${i}`)
        .setLabel(`${LABELS[i]}: ${opt.substring(0, 50)}`)
        .setStyle(ButtonStyle.Primary)
    );
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
    const questionEmbed = buildQuestionEmbed(q, qi, questionCount, topic);

    // Send each question as a new message so it appears at the bottom of chat
    const msg = await interaction.followUp({ embeds: [questionEmbed], components: [row] });
    const answers = new Map<string, number>(); // userId -> chosenIndex

    await new Promise<void>((resolve) => {
      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i) => i.customId.startsWith(`trivia_${gameId}_`),
        time: QUESTION_TIME_MS,
      });
      stopCurrentCollector = () => collector.stop("stopped");

      collector.on("collect", async (btnInteraction) => {
        const userId = btnInteraction.user.id;
        if (answers.has(userId)) {
          await btnInteraction.reply({ content: "Ты уже ответил на этот вопрос!", ephemeral: true });
          return;
        }

        const chosenIndex = parseInt(btnInteraction.customId.split("_").pop()!);
        answers.set(userId, chosenIndex);
        userNames.set(userId, btnInteraction.user.displayName);

        await btnInteraction.reply({
          content: `⏳ Ответ принят! Правильный ответ раскроется после окончания времени.`,
          ephemeral: true,
        });
      });

      collector.on("end", async () => {
        // Count scores
        for (const [userId, chosen] of answers) {
          if (chosen === q.correct) {
            scores.set(userId, (scores.get(userId) ?? 0) + 1);
          } else if (!scores.has(userId)) {
            scores.set(userId, 0);
          }
        }

        // Reveal answer by editing that same message
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          buttons.map((b) => ButtonBuilder.from(b.toJSON()).setDisabled(true))
        );
        const revealEmbed = buildRevealEmbed(q, qi, questionCount, answers, userNames);
        await msg.edit({ embeds: [revealEmbed], components: [disabledRow] }).catch(() => {});

        // Wait, then delete the question message to keep chat clean
        await new Promise((r) => setTimeout(r, REVEAL_PAUSE_MS));
        await msg.delete().catch(() => {});

        resolve();
      });
    });
  }

  unregisterGame(channelId);

  if (stopped) {
    await interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setColor(0x99aab5)
          .setTitle("🛑 Викторина остановлена")
          .setDescription("Игра была принудительно завершена."),
      ],
    }).catch(() => {});
    return;
  }

  // Final leaderboard — also sent as a new message at the bottom
  const leaderboard = buildLeaderboard(scores, userNames, triviaSet.title, topic, questionCount);
  await interaction.followUp({ embeds: [leaderboard], components: [] }).catch(() => {});
}
