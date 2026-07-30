import {
  ChatInputCommandInteraction,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ComponentType,
  ButtonInteraction,
  Message,
} from "discord.js";
import { geminiJSON } from "../ai.js";
import { registerGame, unregisterGame } from "./registry.js";

interface QuestStep {
  title: string;
  situation: string;
  atmosphere: string;
  choices: [string, string, string];
  choiceDescriptions: [string, string, string];
  isEnding?: false;
}

interface QuestEnding {
  title: string;
  ending: string;
  epilogue: string;
  outcome: "victory" | "defeat" | "neutral";
  isEnding: true;
}

type QuestResponse = QuestStep | QuestEnding;

interface ActiveQuest {
  initiatorId: string;
  participants: Map<string, string>;
  history: string[];
  step: number;
  maxSteps: number;
  topic: string | null;
  channelId: string;
}

const activeQuests = new Map<string, ActiveQuest>();
const questStopFns = new Map<string, () => void>();
const DEFAULT_STEPS = 5;
const MIN_STEPS = 3;
const MAX_STEPS_LIMIT = 15;
const VOTE_TIME_MS = 45_000;

const CHOICE_EMOJIS = ["⚔️", "🧠", "🛡️"] as const;
const CHOICE_LABELS = ["Смелый", "Хитрый", "Осторожный"] as const;

// ─── AI generation ──────────────────────────────────────────────────────────

async function generateQuestStep(
  history: string[],
  chosenAction: string | null,
  choiceDescription: string | null,
  step: number,
  participants: string[],
  maxSteps: number,
  topic: string | null
): Promise<QuestResponse> {
  const isLastStep = step >= maxSteps;

  const historyText =
    history.length > 0
      ? `История приключения:\n${history.join("\n")}\n\nОтряд выбрал: ${chosenAction}\n(${choiceDescription})`
      : "";

  const partyText =
    participants.length > 0
      ? `Состав отряда: ${participants.join(", ")}`
      : "Одинокий герой";

  const topicText = topic
    ? `Сеттинг и тема квеста: "${topic}". Строго придерживайся этой темы на протяжении всего квеста.`
    : "Сеттинг: тёмное фэнтези, магия, интриги.";

  if (isLastStep) {
    return geminiJSON<QuestEnding>(
      `Ты — опытный мастер текстового RPG.
${topicText}
${partyText}
${historyText}

Это кульминационный финал квеста. Напиши эпичную, запоминающуюся концовку с учётом всего пройденного пути и темы.

Верни строго валидный JSON (без markdown):
{
  "title": "эпичный заголовок финала (макс 50 символов)",
  "ending": "финальное описание событий (3-4 предложения, кинематографично)",
  "epilogue": "краткий эпилог — что стало с отрядом после (1-2 предложения)",
  "outcome": "victory" или "defeat" или "neutral",
  "isEnding": true
}`
    );
  }

  const progress = step / maxSteps;
  const stepType =
    step === 0
      ? "Создай захватывающее начало квеста с интригующей завязкой и первой опасностью или загадкой."
      : progress < 0.3
      ? "Развей ситуацию, введи новый элемент (персонаж, угрозу или тайну), учитывая выбор отряда."
      : progress < 0.7
      ? "Углуби сюжет — приближаемся к кульминации. Добавь неожиданный поворот или раскрой часть тайны."
      : "Финальный подход — нарастает напряжение, скоро решающий момент. Подготовь почву для развязки.";

  return geminiJSON<QuestStep>(
    `Ты — мастер текстового RPG.
${topicText}
${partyText}
${historyText || "Начни новое приключение для группы игроков."}

${stepType}

Верни строго валидный JSON (без markdown):
{
  "title": "заголовок текущей сцены (макс 50 символов)",
  "situation": "описание происходящего (3-4 предложения, атмосферно, в духе темы)",
  "atmosphere": "одна строка — атмосферная деталь: звук, запах или ощущение сцены",
  "choices": ["смелое действие (коротко)", "хитрое действие (коротко)", "осторожное действие (коротко)"],
  "choiceDescriptions": ["что происходит при смелом выборе", "что происходит при хитром выборе", "что происходит при осторожном выборе"],
  "isEnding": false
}
Варианты должны кардинально отличаться по подходу и потенциальным последствиям.`
  );
}

// ─── Embeds & buttons ────────────────────────────────────────────────────────

function buildQuestEmbed(
  step: QuestResponse,
  stepNum: number,
  participants: Map<string, string>,
  maxSteps: number,
  votes?: Map<number, Set<string>>,
  topic?: string | null
): EmbedBuilder {
  const partyList =
    participants.size > 0
      ? [...participants.values()].map((n) => `\`${n}\``).join(", ")
      : "Нет участников";

  if (step.isEnding) {
    const colors = { victory: 0xffd700, defeat: 0xed4245, neutral: 0x99aab5 };
    const icons = { victory: "🏆", defeat: "💀", neutral: "⚖️" };
    return new EmbedBuilder()
      .setColor(colors[step.outcome])
      .setTitle(`${icons[step.outcome]} ${step.title}`)
      .setDescription(step.ending)
      .addFields(
        { name: "📖 Эпилог", value: step.epilogue },
        { name: "👥 Участники приключения", value: partyList }
      )
      .setFooter({ text: "Квест завершён! Введи /quest чтобы начать новый." });
  }

  const voteLines = votes
    ? [0, 1, 2]
        .map((i) => {
          const v = votes.get(i)?.size ?? 0;
          return v > 0 ? `${CHOICE_EMOJIS[i]} ${CHOICE_LABELS[i]} — ${v} голос(ов)` : null;
        })
        .filter(Boolean)
    : [];

  const embed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setTitle(`⚔️ ${step.title}`)
    .setDescription(step.situation)
    .addFields(
      { name: "🌫️ Атмосфера", value: `*${step.atmosphere}*` },
      { name: `👥 Отряд (${participants.size})`, value: partyList, inline: true }
    )
    .setFooter({
      text: `Шаг ${stepNum} из ${maxSteps}${topic ? ` • Тема: ${topic}` : ""} • Голосуй! (${Math.floor(VOTE_TIME_MS / 1000)}с)`,
    });

  if (voteLines.length > 0) {
    embed.addFields({ name: "📊 Голоса", value: voteLines.join("\n") });
  }

  return embed;
}

function buildChoiceButtons(
  step: QuestStep,
  questId: string,
  stepNum: number,
  votes: Map<number, Set<string>>,
  disabled = false
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    step.choices.map((choice, i) => {
      const voteCount = votes.get(i)?.size ?? 0;
      const label = `${CHOICE_LABELS[i]}: ${choice.substring(0, 45)}${voteCount > 0 ? ` (${voteCount})` : ""}`;
      return new ButtonBuilder()
        .setCustomId(`quest_${questId}_s${stepNum}_${i}`)
        .setLabel(label.substring(0, 80))
        .setEmoji(CHOICE_EMOJIS[i])
        .setStyle(
          i === 0 ? ButtonStyle.Danger : i === 1 ? ButtonStyle.Primary : ButtonStyle.Success
        )
        .setDisabled(disabled);
    })
  );
}

// ─── Per-step runner ─────────────────────────────────────────────────────────

async function runStep(
  questId: string,
  quest: ActiveQuest,
  interaction: ChatInputCommandInteraction,
  currentStep: QuestStep,
  msg: Message
): Promise<void> {
  const stepNum = quest.step;
  const votes = new Map<number, Set<string>>();
  const prefix = `quest_${questId}_s${stepNum}_`;

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.customId.startsWith(prefix),
    time: VOTE_TIME_MS,
  });
  questStopFns.set(questId, () => collector.stop("stopped"));

  await new Promise<void>((resolve) => {
    collector.on("collect", async (btnInteraction: ButtonInteraction) => {
      const userId = btnInteraction.user.id;
      const userName = btnInteraction.user.displayName;

      if (!quest.participants.has(userId)) {
        quest.participants.set(userId, userName);
      }

      const choiceIndex = parseInt(btnInteraction.customId.split("_").pop()!);

      // Remove previous vote from this user
      for (const voters of votes.values()) {
        voters.delete(userId);
      }
      if (!votes.has(choiceIndex)) votes.set(choiceIndex, new Set());
      votes.get(choiceIndex)!.add(userId);

      const totalVotes = [...votes.values()].reduce((s, v) => s + v.size, 0);

      await btnInteraction.reply({
        content: `✅ **${userName}** → **${CHOICE_EMOJIS[choiceIndex]} ${CHOICE_LABELS[choiceIndex]}** (голосов: ${totalVotes})`,
        ephemeral: false,
      }).catch(() => {});

      // Update embed with live vote counts
      const updatedEmbed = buildQuestEmbed(currentStep, stepNum + 1, quest.participants, quest.maxSteps, votes, quest.topic);
      const updatedRow = buildChoiceButtons(currentStep, questId, stepNum, votes);
      await interaction.editReply({ embeds: [updatedEmbed], components: [updatedRow] }).catch(() => {});

      // Advance immediately if everyone has voted (2+ players)
      if (totalVotes >= quest.participants.size && quest.participants.size >= 2) {
        collector.stop("all_voted");
      }
    });

    collector.on("end", async (_, reason) => {
      questStopFns.delete(questId);
      if (reason === "stopped" || !activeQuests.has(questId)) {
        if (reason === "stopped") {
          activeQuests.delete(questId);
          unregisterGame(quest.channelId);
          const stoppedEmbed = new EmbedBuilder()
            .setColor(0x99aab5)
            .setTitle("🛑 Квест остановлен")
            .setDescription("Квест был принудительно завершён.");
          await interaction.editReply({ embeds: [stoppedEmbed], components: [] }).catch(() => {});
        }
        resolve();
        return;
      }

      // Determine winning choice
      const tallied = [0, 1, 2].map((i) => ({ index: i, count: votes.get(i)?.size ?? 0 }));
      const maxVotes = Math.max(...tallied.map((v) => v.count));
      const winners = tallied.filter((v) => v.count === maxVotes && v.count > 0);
      const choiceIndex =
        winners.length > 0
          ? winners[Math.floor(Math.random() * winners.length)].index
          : Math.floor(Math.random() * 3);

      const chosenText = currentStep.choices[choiceIndex];
      const chosenDesc = currentStep.choiceDescriptions[choiceIndex];
      const voterNames = [...(votes.get(choiceIndex)?.values() ?? [])].map(
        (id) => quest.participants.get(id) ?? "Неизвестный"
      );

      // Show decision embed
      const disabledRow = buildChoiceButtons(currentStep, questId, stepNum, votes, true);
      const decisionEmbed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🗳️ Отряд принял решение!")
        .setDescription(
          `**${CHOICE_EMOJIS[choiceIndex]} ${CHOICE_LABELS[choiceIndex]}:** ${chosenText}\n\n*${chosenDesc}*`
        )
        .addFields({
          name: reason === "time" ? "⏰ Время вышло, выбрано по большинству" : "Проголосовали за",
          value: voterNames.length > 0 ? voterNames.join(", ") : "Случайный выбор судьбы",
        })
        .setFooter({ text: "История разворачивается..." });

      await interaction.editReply({ embeds: [decisionEmbed], components: [disabledRow] }).catch(() => {});

      // Update history
      quest.history.push(`[Шаг ${stepNum + 1}] ${currentStep.situation}`);
      quest.history.push(`Выбор: ${chosenText} — ${chosenDesc}`);
      quest.step++;

      // Short pause then generate next step
      await new Promise((r) => setTimeout(r, 2000));

      const loadingEmbed = new EmbedBuilder()
        .setColor(0x99aab5)
        .setTitle("⏳ История разворачивается...")
        .setDescription("Подождите секунду...");
      await interaction.editReply({ embeds: [loadingEmbed], components: [] }).catch(() => {});

      try {
        const nextStep = await generateQuestStep(
          quest.history,
          chosenText,
          chosenDesc,
          quest.step,
          [...quest.participants.values()],
          quest.maxSteps,
          quest.topic
        );

        const nextEmbed = buildQuestEmbed(nextStep, quest.step + 1, quest.participants, quest.maxSteps, undefined, quest.topic);

        if (nextStep.isEnding) {
          await interaction.editReply({ embeds: [nextEmbed], components: [] }).catch(() => {});
          activeQuests.delete(questId);
          unregisterGame(quest.channelId);
        } else {
          const nextVotes = new Map<number, Set<string>>();
          const nextRow = buildChoiceButtons(nextStep as QuestStep, questId, quest.step, nextVotes);
          const nextMsg = await interaction.editReply({ embeds: [nextEmbed], components: [nextRow] }).catch(() => null);

          if (nextMsg) {
            await runStep(questId, quest, interaction, nextStep as QuestStep, nextMsg as Message);
          }
        }
      } catch (err) {
        console.error("Quest step error:", err);
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setColor(0xed4245)
              .setTitle("❌ Ошибка")
              .setDescription("Что-то пошло не так. Попробуй /quest снова!"),
          ],
          components: [],
        }).catch(() => {});
        activeQuests.delete(questId);
        unregisterGame(quest.channelId);
      }

      resolve();
    });
  });
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function handleQuest(interaction: ChatInputCommandInteraction) {
  const channelId = interaction.channelId;
  const existing = [...activeQuests.values()].find((q) => q.channelId === channelId);

  if (existing) {
    await interaction.reply({
      content: "⚔️ В этом канале уже идёт квест! Присоединяйся и нажимай кнопки.",
      ephemeral: true,
    });
    return;
  }

  const maxSteps = Math.min(
    Math.max(interaction.options.getInteger("события") ?? DEFAULT_STEPS, MIN_STEPS),
    MAX_STEPS_LIMIT
  );
  const topic = interaction.options.getString("тема");

  await interaction.deferReply();

  const questId = `${interaction.user.id}_${Date.now()}`;
  const quest: ActiveQuest = {
    initiatorId: interaction.user.id,
    participants: new Map([[interaction.user.id, interaction.user.displayName]]),
    history: [],
    step: 0,
    maxSteps,
    topic,
    channelId,
  };
  activeQuests.set(questId, quest);
  registerGame(channelId, "Квест", () => {
    activeQuests.delete(questId);
    questStopFns.get(questId)?.();
  });

  const startEmbed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("⚔️ Начало нового приключения!")
    .setDescription(
      `**${interaction.user.displayName}** созывает отряд!\n\nВсе желающие могут нажимать кнопки выбора и участвовать в голосовании.`
    )
    .addFields(
      { name: "🗺️ Тема", value: topic ?? "случайное фэнтези", inline: true },
      { name: "📜 Событий", value: `${maxSteps}`, inline: true }
    )
    .setFooter({ text: "Загрузка квеста..." });

  await interaction.editReply({ embeds: [startEmbed] });

  try {
    const firstStep = await generateQuestStep(
      [],
      null,
      null,
      0,
      [interaction.user.displayName],
      maxSteps,
      topic
    ) as QuestStep;

    const votes = new Map<number, Set<string>>();
    const embed = buildQuestEmbed(firstStep, 1, quest.participants, maxSteps, votes, topic);
    const row = buildChoiceButtons(firstStep, questId, 0, votes);

    const msg = await interaction.editReply({ embeds: [embed], components: [row] });

    await runStep(questId, quest, interaction, firstStep, msg as Message);
  } catch (err) {
    console.error("Quest start error:", err);
    await interaction.editReply("Не смог начать квест. Попробуй ещё раз!").catch(() => {});
    activeQuests.delete(questId);
    unregisterGame(channelId);
  }
}
