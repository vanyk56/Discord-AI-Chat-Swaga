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

interface MLQuestions {
  questions: string[];
}

const activeMostLikely = new Map<string, boolean>();
const JOIN_TIME_MS = 30_000;
const VOTE_TIME_MS = 20_000;
const DEFAULT_ROUNDS = 5;

async function generateQuestions(count: number): Promise<string[]> {
  const data = await geminiJSON<MLQuestions>(
    `Придумай ${count} смешных и интересных вопросов для игры "Кто скорее всего...".
Вопросы должны быть забавными, немного провокационными, но дружелюбными. Подходят для группы друзей.
Примеры: "Кто скорее всего опоздает на собственную свадьбу?", "Кто скорее всего потеряет телефон на вечеринке?"

Верни строго валидный JSON (без markdown):
{
  "questions": ["вопрос 1", "вопрос 2", ...]
}
Ровно ${count} вопросов. Не используй нумерацию в тексте вопросов.`
  );
  return data.questions;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

export async function handleMostLikely(interaction: ChatInputCommandInteraction) {
  const channelId = interaction.channelId;

  if (activeMostLikely.has(channelId)) {
    await interaction.reply({ content: "🎯 В этом канале уже идёт игра!", ephemeral: true });
    return;
  }

  const roundCount = interaction.options.getInteger("раунды") ?? DEFAULT_ROUNDS;
  const gameId = `ml_${interaction.id}`;

  activeMostLikely.set(channelId, true);
  await interaction.deferReply();

  let stopped = false;
  let stopCurrentRound: (() => void) | null = null;
  registerGame(channelId, "Кто скорее всего", () => {
    stopped = true;
    stopCurrentRound?.();
  });

  // ── Join phase ────────────────────────────────────────────────────────────

  const participants = new Map<string, string>(); // userId -> displayName
  participants.set(interaction.user.id, interaction.user.displayName);

  const joinButton = new ButtonBuilder()
    .setCustomId(`${gameId}_join`)
    .setLabel("🎮 Играть!")
    .setStyle(ButtonStyle.Success);

  const joinEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🎯 Кто скорее всего...")
    .setDescription(
      `**${interaction.user.displayName}** начинает игру!\n\n` +
      `Нажми **Играть!** чтобы присоединиться.\n` +
      `Игра начнётся через **${JOIN_TIME_MS / 1000} секунд** или когда наберётся 10 игроков.`
    )
    .addFields({ name: "👥 Участники", value: `\`${interaction.user.displayName}\`` })
    .setFooter({ text: `Нужно минимум 2 игрока • Раундов: ${roundCount}` });

  const joinMsg = await interaction.editReply({ embeds: [joinEmbed], components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinButton)] });

  const joinCollector = joinMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.customId === `${gameId}_join`,
    time: JOIN_TIME_MS,
  });
  stopCurrentRound = () => joinCollector.stop("stopped");

  await new Promise<void>((resolve) => {
    joinCollector.on("collect", async (btn) => {
      if (participants.has(btn.user.id)) {
        await btn.reply({ content: "Ты уже в игре!", ephemeral: true });
        return;
      }
      participants.set(btn.user.id, btn.user.displayName);

      const names = [...participants.values()].map((n) => `\`${n}\``).join(", ");
      await btn.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("🎯 Кто скорее всего...")
            .setDescription(
              `**${interaction.user.displayName}** начинает игру!\n\n` +
              `Нажми **Играть!** чтобы присоединиться.`
            )
            .addFields({ name: `👥 Участники (${participants.size})`, value: names })
            .setFooter({ text: `Нужно минимум 2 игрока • Раундов: ${roundCount}` }),
        ],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(joinButton)],
      });

      if (participants.size >= 10) joinCollector.stop("full");
    });

    joinCollector.on("end", () => resolve());
  });

  if (stopped) {
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0x99aab5).setTitle("🛑 Игра остановлена").setDescription("Игра была принудительно завершена.")],
      components: [],
    });
    activeMostLikely.delete(channelId);
    unregisterGame(channelId);
    return;
  }

  if (participants.size < 2) {
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("❌ Недостаточно игроков").setDescription("Нужно минимум 2 человека. Попробуй ещё раз!")],
      components: [],
    });
    activeMostLikely.delete(channelId);
    unregisterGame(channelId);
    return;
  }

  // ── Generate questions ────────────────────────────────────────────────────

  await interaction.editReply({
    embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("⏳ Генерирую вопросы...").setDescription("Подождите секунду!")],
    components: [],
  });

  let questions: string[];
  try {
    questions = await generateQuestions(roundCount);
  } catch {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("❌ Ошибка").setDescription("Не смог придумать вопросы. Попробуй снова!")], components: [] });
    activeMostLikely.delete(channelId);
    unregisterGame(channelId);
    return;
  }

  // ── Rounds ────────────────────────────────────────────────────────────────

  const playerList = [...participants.entries()]; // [userId, name][]
  const scores = new Map<string, number>();
  for (const id of participants.keys()) scores.set(id, 0);

  for (let r = 0; r < questions.length; r++) {
    if (stopped) break;
    const question = questions[r];
    const roundVotes = new Map<string, string>(); // voterId -> targetId
    const voteCounts = new Map<string, number>(); // targetId -> count
    for (const id of participants.keys()) voteCounts.set(id, 0);

    // Build player buttons (up to 25 across 5 rows)
    const buttons = playerList.map(([id, name], idx) =>
      new ButtonBuilder()
        .setCustomId(`${gameId}_r${r}_p${idx}`)
        .setLabel(name.substring(0, 50))
        .setStyle(ButtonStyle.Secondary)
    );
    const rows = chunk(buttons, 5).slice(0, 5).map((btns) =>
      new ActionRowBuilder<ButtonBuilder>().addComponents(btns)
    );

    const roundEmbed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle(`🎯 Кто скорее всего...`)
      .setDescription(`**${question}**`)
      .setFooter({ text: `Раунд ${r + 1} из ${roundCount} • Голосуй за участника! (${VOTE_TIME_MS / 1000}с)` });

    const roundMsg = await interaction.editReply({ embeds: [roundEmbed], components: rows });

    const voteCollector = roundMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      filter: (i) => i.customId.startsWith(`${gameId}_r${r}_p`),
      time: VOTE_TIME_MS,
    });
    stopCurrentRound = () => voteCollector.stop("stopped");

    await new Promise<void>((resolve) => {
      voteCollector.on("collect", async (btn) => {
        const voterId = btn.user.id;
        const playerIdx = parseInt(btn.customId.split("_p")[1]);
        const [targetId, targetName] = playerList[playerIdx];

        if (voterId === targetId) {
          await btn.reply({ content: "Нельзя голосовать за себя! 😄", ephemeral: true });
          return;
        }
        if (!participants.has(voterId)) {
          await btn.reply({ content: "Ты не в игре!", ephemeral: true });
          return;
        }

        // Remove previous vote
        const prev = roundVotes.get(voterId);
        if (prev) voteCounts.set(prev, (voteCounts.get(prev) ?? 1) - 1);

        roundVotes.set(voterId, targetId);
        voteCounts.set(targetId, (voteCounts.get(targetId) ?? 0) + 1);

        await btn.reply({ content: `✅ Ты проголосовал за **${targetName}**!`, ephemeral: true });
      });

      voteCollector.on("end", () => resolve());
    });

    // Count scores: most voted gets points
    const maxVotes = Math.max(...[...voteCounts.values()]);
    if (maxVotes > 0) {
      for (const [id, count] of voteCounts) {
        if (count === maxVotes) scores.set(id, (scores.get(id) ?? 0) + 1);
      }
    }

    // Build result
    const resultLines = playerList
      .map(([id, name]) => {
        const v = voteCounts.get(id) ?? 0;
        return v > 0 ? `${v >= maxVotes && maxVotes > 0 ? "🏆 " : ""}**${name}** — ${v} голос(ов)` : null;
      })
      .filter(Boolean);

    const resultEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(`🎯 ${question}`)
      .setDescription(resultLines.length > 0 ? resultLines.join("\n") : "Никто не проголосовал 😶")
      .setFooter({ text: `Раунд ${r + 1} из ${roundCount} завершён` });

    const disabledRows = chunk(
      buttons.map((b) => ButtonBuilder.from(b.toJSON()).setDisabled(true)),
      5
    ).slice(0, 5).map((btns) => new ActionRowBuilder<ButtonBuilder>().addComponents(btns));

    await interaction.editReply({ embeds: [resultEmbed], components: disabledRows });

    if (r < questions.length - 1) await new Promise((r) => setTimeout(r, 4000));
  }

  // ── Leaderboard ───────────────────────────────────────────────────────────

  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const medals = ["🥇", "🥈", "🥉"];
  const board = sorted
    .map(([id, pts], i) => `${medals[i] ?? `${i + 1}.`} **${participants.get(id)}** — ${pts} победных раундов`)
    .join("\n");

  activeMostLikely.delete(channelId);
  unregisterGame(channelId);

  if (stopped) {
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0x99aab5).setTitle("🛑 Игра остановлена").setDescription("Игра была принудительно завершена.")],
      components: [],
    });
    return;
  }

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle("🏆 Итоги игры «Кто скорее всего»")
        .setDescription(board || "Никто не набрал очков 😔")
        .addFields({ name: "👥 Участников", value: `${participants.size}`, inline: true }, { name: "🔄 Раундов", value: `${roundCount}`, inline: true })
        .setFooter({ text: "Используй /mostlikely чтобы сыграть снова!" }),
    ],
    components: [],
  });
}
