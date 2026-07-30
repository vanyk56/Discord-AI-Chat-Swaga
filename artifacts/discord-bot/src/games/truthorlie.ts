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

interface TruthOrLieRound {
  statements: [string, string, string, string];
  falseIndex: number;
  explanation: string;
}

interface TruthOrLieSet {
  rounds: TruthOrLieRound[];
}

const activeTruthOrLie = new Map<string, boolean>();
const VOTE_TIME_MS = 25_000;
const DEFAULT_ROUNDS = 5;

async function generateRounds(topic: string | null, count: number): Promise<TruthOrLieRound[]> {
  const data = await geminiJSON<TruthOrLieSet>(
    `Придумай ${count} раундов для игры "Правда или Ложь"${topic ? ` на тему: "${topic}"` : " на разные интересные темы"}.
В каждом раунде — 4 утверждения, ОДНО из которых ЛОЖНОЕ. Остальные три — правда.
Утверждения должны быть интересными, неочевидными, из мира науки, истории, природы, рекордов и т.д.

Верни строго валидный JSON (без markdown):
{
  "rounds": [
    {
      "statements": ["утверждение 1", "утверждение 2", "утверждение 3", "утверждение 4"],
      "falseIndex": <индекс ложного утверждения 0-3>,
      "explanation": "краткое объяснение почему это ложь и что на самом деле правда (1-2 предложения)"
    }
  ]
}
Ровно ${count} раундов. Ложное утверждение должно звучать правдоподобно!`
  );
  return data.rounds;
}

const OPTION_LABELS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"] as const;

export async function handleTruthOrLie(interaction: ChatInputCommandInteraction) {
  const channelId = interaction.channelId;

  if (activeTruthOrLie.has(channelId)) {
    await interaction.reply({ content: "🃏 В этом канале уже идёт игра!", ephemeral: true });
    return;
  }

  const topic = interaction.options.getString("тема");
  const roundCount = interaction.options.getInteger("раунды") ?? DEFAULT_ROUNDS;

  activeTruthOrLie.set(channelId, true);
  await interaction.deferReply();

  let stopped = false;
  let stopCurrentRound: (() => void) | null = null;
  registerGame(channelId, "Правда или Ложь", () => {
    stopped = true;
    stopCurrentRound?.();
  });

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🃏 Правда или Ложь")
        .setDescription(
          `${topic ? `Тема: **${topic}**\n\n` : ""}Генерирую утверждения... Подождите!`
        ),
    ],
  });

  let rounds: TruthOrLieRound[];
  try {
    rounds = await generateRounds(topic, roundCount);
  } catch {
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("❌ Ошибка").setDescription("Не смог придумать утверждения. Попробуй снова!")],
    });
    activeTruthOrLie.delete(channelId);
    unregisterGame(channelId);
    return;
  }

  const scores = new Map<string, number>();
  const userNames = new Map<string, string>();
  const gameId = interaction.id;

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🃏 Правда или Ложь")
        .setDescription(
          `${topic ? `Тема: **${topic}**\n\n` : ""}Найди **ложное** утверждение среди четырёх!\n\n⏳ Первый раунд через 3 секунды...`
        )
        .setFooter({ text: `${roundCount} раундов • Правильный ответ раскрывается после голосования` }),
    ],
  });

  await new Promise((r) => setTimeout(r, 3000));

  for (let r = 0; r < rounds.length; r++) {
    if (stopped) break;
    const round = rounds[r];
    const roundVotes = new Map<string, number>(); // userId -> chosen index
    const roundId = `${gameId}_r${r}`;

    const buttons = round.statements.map((_, i) =>
      new ButtonBuilder()
        .setCustomId(`tol_${roundId}_${i}`)
        .setLabel(OPTION_LABELS[i])
        .setStyle(ButtonStyle.Secondary)
    );
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

    const questionEmbed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle(`🃏 Раунд ${r + 1} из ${roundCount} — Найди ложь!`)
      .setDescription(
        round.statements.map((s, i) => `${OPTION_LABELS[i]} ${s}`).join("\n\n")
      )
      .setFooter({ text: `Одно из этих утверждений — ЛОЖЬ. Нажми цифру!${topic ? ` • Тема: ${topic}` : ""} (${VOTE_TIME_MS / 1000}с)` });

    const msg = await interaction.followUp({ embeds: [questionEmbed], components: [row] });

    const voteCollector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) => i.customId.startsWith(`tol_${roundId}_`),
      time: VOTE_TIME_MS,
    });
    stopCurrentRound = () => voteCollector.stop("stopped");

    await new Promise<void>((resolve) => {
      voteCollector.on("collect", async (btn) => {
        const userId = btn.user.id;
        const chosen = parseInt(btn.customId.split("_").pop()!);

        if (roundVotes.has(userId)) {
          await btn.reply({ content: "Ты уже проголосовал в этом раунде!", ephemeral: true });
          return;
        }

        roundVotes.set(userId, chosen);
        userNames.set(userId, btn.user.displayName);

        const correct = chosen === round.falseIndex;
        await btn.reply({
          content: correct
            ? `✅ Отличный выбор — посмотрим, угадал ли ты!`
            : `🤔 Интересно... ждём остальных!`,
          ephemeral: true,
        });
      });

      voteCollector.on("end", async () => {
        // Count scores
        for (const [userId, chosen] of roundVotes) {
          if (chosen === round.falseIndex) {
            scores.set(userId, (scores.get(userId) ?? 0) + 1);
          } else if (!scores.has(userId)) {
            scores.set(userId, 0);
          }
        }

        const correctCount = [...roundVotes.values()].filter((v) => v === round.falseIndex).length;
        const winners = [...roundVotes.entries()]
          .filter(([, v]) => v === round.falseIndex)
          .map(([id]) => `✅ ${userNames.get(id) ?? "???"}`);

        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          buttons.map((b, i) =>
            ButtonBuilder.from(b.toJSON())
              .setDisabled(true)
              .setStyle(i === round.falseIndex ? ButtonStyle.Danger : ButtonStyle.Success)
          )
        );

        const revealEmbed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle(`🃏 Раунд ${r + 1} — Ответ раскрыт!`)
          .setDescription(
            round.statements.map((s, i) => {
              const mark = i === round.falseIndex ? "❌" : "✅";
              return `${mark} ${OPTION_LABELS[i]} ${s}`;
            }).join("\n\n")
          )
          .addFields(
            { name: "💡 Объяснение", value: round.explanation },
            {
              name: `🎯 Угадали ${correctCount} из ${roundVotes.size}`,
              value: winners.length > 0 ? winners.slice(0, 10).join("\n") : "Никто не угадал",
            }
          );

        await msg.edit({ embeds: [revealEmbed], components: [disabledRow] }).catch(() => {});
        await new Promise((r) => setTimeout(r, 5000));
        await msg.delete().catch(() => {});

        resolve();
      });
    });
  }

  activeTruthOrLie.delete(channelId);
  unregisterGame(channelId);

  if (stopped) {
    await interaction.followUp({
      embeds: [new EmbedBuilder().setColor(0x99aab5).setTitle("🛑 Игра остановлена").setDescription("Игра была принудительно завершена.")],
    }).catch(() => {});
    return;
  }

  // Final leaderboard
  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const medals = ["🥇", "🥈", "🥉"];
  const board =
    sorted.length > 0
      ? sorted
          .map(([id, pts], i) => `${medals[i] ?? `${i + 1}.`} **${userNames.get(id) ?? id}** — ${pts} из ${rounds.length} правильных`)
          .join("\n")
      : "Никто не участвовал 😔";

  await interaction.followUp({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle("🏆 Правда или Ложь — Итоги!")
        .setDescription(board)
        .addFields(
          { name: "📋 Тема", value: topic ?? "разные", inline: true },
          { name: "🔄 Раундов", value: `${roundCount}`, inline: true },
          { name: "👥 Участников", value: `${userNames.size}`, inline: true }
        )
        .setFooter({ text: "Используй /truthorlie чтобы сыграть снова!" }),
    ],
  });

  activeTruthOrLie.delete(channelId);
}
