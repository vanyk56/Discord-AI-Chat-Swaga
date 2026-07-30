import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
  Message,
} from "discord.js";
import { geminiJSON, geminiText } from "../ai.js";
import { registerGame, unregisterGame } from "./registry.js";

interface RiddleData {
  riddle: string;
  answer: string;
  hint: string;
}

async function checkAnswer(userAnswer: string, correctAnswer: string): Promise<boolean> {
  try {
    const result = await geminiText(
      `Правильный ответ на загадку: "${correctAnswer}"
Ответ пользователя: "${userAnswer}"
Является ли ответ пользователя правильным (учитывай разные формы слова, синонимы, частичные совпадения)?
Ответь только "да" или "нет".`
    );
    return result.toLowerCase().includes("да");
  } catch {
    return userAnswer.toLowerCase().includes(correctAnswer.toLowerCase());
  }
}

export async function handleRiddle(interaction: ChatInputCommandInteraction) {
  const channelId = interaction.channelId;
  await interaction.deferReply();

  let riddleData: RiddleData;
  try {
    riddleData = await geminiJSON<RiddleData>(
      `Придумай интересную и нетривиальную загадку на русском языке.
Верни JSON:
{
  "riddle": "текст загадки",
  "answer": "ответ (одно-два слова)",
  "hint": "подсказка (не называй ответ прямо, но намекни)"
}
Загадка должна быть логичной, но не слишком простой.`
    );
  } catch {
    await interaction.editReply("Не смог придумать загадку. Попробуй ещё раз!");
    return;
  }

  const hintBtn = new ButtonBuilder()
    .setCustomId("riddle_hint")
    .setLabel("💡 Подсказка")
    .setStyle(ButtonStyle.Secondary);

  const revealBtn = new ButtonBuilder()
    .setCustomId("riddle_reveal")
    .setLabel("🏳️ Показать ответ")
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(hintBtn, revealBtn);

  const embed = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle("🔮 Загадка")
    .setDescription(`**${riddleData.riddle}**`)
    .setFooter({ text: "Напишите ответ в чат! У вас 60 секунд." });

  const msg = await interaction.editReply({ embeds: [embed], components: [row] });

  const winners = new Set<string>();
  let hintShown = false;
  let gameOver = false;

  // Message collector for answers
  const msgCollector = interaction.channel!.createMessageCollector({
    time: 60_000,
    filter: (m: Message) => !m.author.bot,
  });

  // Button collector for hint/reveal
  const btnCollector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.customId === "riddle_hint" || i.customId === "riddle_reveal",
    time: 60_000,
  });

  let hintTimeout: ReturnType<typeof setTimeout>;

  registerGame(channelId, "Загадка", () => {
    gameOver = true;
    clearTimeout(hintTimeout);
    msgCollector.stop("stopped");
    btnCollector.stop();
  });

  // Show hint after 30 seconds automatically
  hintTimeout = setTimeout(async () => {
    if (!gameOver && !hintShown) {
      hintShown = true;
      const hintEmbed = EmbedBuilder.from(embed.toJSON())
        .addFields({ name: "💡 Подсказка", value: riddleData.hint });
      await interaction.editReply({ embeds: [hintEmbed], components: [row] }).catch(() => {});
    }
  }, 30_000);

  btnCollector.on("collect", async (btnInteraction) => {
    if (btnInteraction.customId === "riddle_hint") {
      hintShown = true;
      await btnInteraction.reply({ content: `💡 Подсказка: ${riddleData.hint}`, ephemeral: true });
    } else if (btnInteraction.customId === "riddle_reveal") {
      gameOver = true;
      clearTimeout(hintTimeout);
      msgCollector.stop("revealed");
      btnCollector.stop();
      await btnInteraction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x99AAB5)
            .setTitle("🏳️ Ответ раскрыт")
            .setDescription(`Правильный ответ: **${riddleData.answer}**`),
        ],
      });
      finishGame();
    }
  });

  msgCollector.on("collect", async (m: Message) => {
    if (gameOver) return;
    const isCorrect = await checkAnswer(m.content, riddleData.answer);
    if (isCorrect) {
      winners.add(m.author.id);
      await m.reply(`✅ **Правильно!** ${m.author.displayName} угадал(а)! Ответ: **${riddleData.answer}**`);
      if (winners.size === 1) {
        gameOver = true;
        clearTimeout(hintTimeout);
        msgCollector.stop("solved");
        btnCollector.stop();
        finishGame();
      }
    }
  });

  msgCollector.on("end", (_, reason) => {
    if (reason === "stopped") {
      unregisterGame(channelId);
      finishGame(false, true);
    } else if (reason !== "solved" && reason !== "revealed" && !gameOver) {
      gameOver = true;
      clearTimeout(hintTimeout);
      unregisterGame(channelId);
      finishGame(true);
    }
  });

  function finishGame(timeout = false, stopped = false) {
    unregisterGame(channelId);
    let title: string;
    let description: string;
    if (stopped) {
      title = "🛑 Загадка остановлена";
      description = `Игра была принудительно завершена.\nОтвет: **${riddleData.answer}**`;
    } else if (winners.size > 0) {
      title = "🎉 Загадка разгадана!";
      description = `Правильный ответ: **${riddleData.answer}**`;
    } else {
      title = "⏰ Время вышло!";
      description = timeout
        ? `Никто не угадал. Правильный ответ: **${riddleData.answer}**`
        : `Правильный ответ: **${riddleData.answer}**`;
    }

    const finalEmbed = new EmbedBuilder()
      .setColor(stopped ? 0x99aab5 : winners.size > 0 ? 0x57F287 : 0xED4245)
      .setTitle(title)
      .setDescription(description);

    const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ButtonBuilder.from(hintBtn.toJSON()).setDisabled(true),
      ButtonBuilder.from(revealBtn.toJSON()).setDisabled(true)
    );

    interaction.editReply({ embeds: [finalEmbed], components: [disabledRow] }).catch(() => {});
  }
}
