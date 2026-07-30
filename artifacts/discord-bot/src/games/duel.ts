import {
  ChatInputCommandInteraction,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ComponentType,
  ButtonInteraction,
  User,
  Message,
} from "discord.js";
import { geminiJSON, geminiText } from "../ai.js";
import { registerGame, unregisterGame } from "./registry.js";

interface DuelChallenge {
  title: string;
  challenge: string;
  criteria: string;
}

async function generateChallenge(): Promise<DuelChallenge> {
  return geminiJSON<DuelChallenge>(
    `Придумай творческое и смешное испытание для дуэли между двумя игроками в Discord.
Испытание должно быть выполнимым текстом (написать стишок, придумать историю, описать что-то и т.д.).
Верни JSON:
{
  "title": "название дуэли (макс 40 символов)",
  "challenge": "описание задания (что именно нужно сделать, 1-2 предложения)",
  "criteria": "критерии победы (что делает ответ лучшим, 1 предложение)"
}
Примеры тем: написать хайку, придумать слоган, сочинить продолжение истории, описать предмет нестандартно.`
  );
}

async function judgeSubmissions(
  challenge: DuelChallenge,
  player1: User,
  sub1: string,
  player2: User,
  sub2: string
): Promise<{ winner: User; reason: string }> {
  const judgment = await geminiText(
    `Ты судья в творческой дуэли. Задание: "${challenge.challenge}"
Критерии победы: ${challenge.criteria}

Участник 1 (${player1.username}): "${sub1}"
Участник 2 (${player2.username}): "${sub2}"

Выбери победителя и объясни почему. Ответь в формате:
ПОБЕДИТЕЛЬ: [1 или 2]
ПРИЧИНА: [одно предложение объяснения]`
  );

  const winnerMatch = judgment.match(/ПОБЕДИТЕЛЬ:\s*([12])/);
  const reasonMatch = judgment.match(/ПРИЧИНА:\s*(.+)/);

  const winnerNum = winnerMatch ? parseInt(winnerMatch[1]) : (Math.random() > 0.5 ? 1 : 2);
  const reason = reasonMatch ? reasonMatch[1].trim() : "Оба показали отличный результат!";

  return {
    winner: winnerNum === 1 ? player1 : player2,
    reason,
  };
}

export async function handleDuel(interaction: ChatInputCommandInteraction) {
  const opponent = interaction.options.getUser("opponent", true);
  const challenger = interaction.user;

  if (opponent.id === challenger.id) {
    await interaction.reply({ content: "Нельзя вызвать самого себя на дуэль! 😅", ephemeral: true });
    return;
  }
  if (opponent.bot) {
    await interaction.reply({ content: "Нельзя вызвать бота на дуэль!", ephemeral: true });
    return;
  }

  const acceptBtn = new ButtonBuilder()
    .setCustomId("duel_accept")
    .setLabel("⚔️ Принять вызов!")
    .setStyle(ButtonStyle.Success);

  const declineBtn = new ButtonBuilder()
    .setCustomId("duel_decline")
    .setLabel("🏳️ Отказаться")
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(acceptBtn, declineBtn);

  const challengeEmbed = new EmbedBuilder()
    .setColor(0xFF6B35)
    .setTitle("⚔️ Вызов на дуэль!")
    .setDescription(
      `${challenger} бросает вызов ${opponent}!\n\n${opponent}, ты принимаешь?`
    )
    .setFooter({ text: "Вызов истекает через 60 секунд" });

  await interaction.reply({ embeds: [challengeEmbed], components: [row] });
  const msg = await interaction.fetchReply();

  const btnCollector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.customId === "duel_accept" || i.customId === "duel_decline",
    time: 60_000,
    max: 1,
  });

  btnCollector.on("collect", async (btnInteraction: ButtonInteraction) => {
    if (btnInteraction.user.id !== opponent.id) {
      await btnInteraction.reply({ content: "Это не твой вызов!", ephemeral: true });
      return;
    }

    if (btnInteraction.customId === "duel_decline") {
      await btnInteraction.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0x99AAB5)
            .setTitle("🏳️ Вызов отклонён")
            .setDescription(`${opponent} отказался от дуэли. Трус!`),
        ],
        components: [],
      });
      return;
    }

    // Accepted!
    await btnInteraction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFFD700)
          .setTitle("⚔️ Дуэль начинается!")
          .setDescription("ИИ готовит испытание..."),
      ],
      components: [],
    });

    let challenge: DuelChallenge;
    try {
      challenge = await generateChallenge();
    } catch {
      await interaction.editReply({
        embeds: [new EmbedBuilder().setColor(0xED4245).setTitle("❌ Ошибка").setDescription("Не смог придумать испытание. Попробуй ещё раз!")],
        components: [],
      });
      return;
    }

    const duelEmbed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setTitle(`⚔️ ${challenge.title}`)
      .setDescription(`**Задание:** ${challenge.challenge}`)
      .addFields(
        { name: "🏆 Критерий победы", value: challenge.criteria },
        { name: "📋 Правила", value: `${challenger} и ${opponent} — оба пишут ответ в этот канал в течение **90 секунд**!\nПобедителя определит ИИ.` }
      )
      .setFooter({ text: "Пишите ваши ответы прямо сейчас! У вас 90 секунд." });

    await interaction.editReply({ embeds: [duelEmbed], components: [] });

    const submissions = new Map<string, string>();
    const players = [challenger, opponent];

    const msgCollector = interaction.channel!.createMessageCollector({
      time: 90_000,
      filter: (m: Message) =>
        players.some((p) => p.id === m.author.id) && !m.author.bot,
    });
    registerGame(interaction.channelId, "Дуэль", () => {
      msgCollector.stop("stopped");
    });

    msgCollector.on("collect", async (m: Message) => {
      if (submissions.has(m.author.id)) return;
      submissions.set(m.author.id, m.content);
      const remaining = players.filter((p) => !submissions.has(p.id));
      if (remaining.length > 0) {
        await m.react("✅");
        await interaction.channel?.send(
          `✅ Ответ от **${m.author.displayName}** принят! Ждём ${remaining.map((u) => u.toString()).join(", ")}...`
        );
      }
      if (submissions.size === 2) {
        msgCollector.stop("both_submitted");
      }
    });

    msgCollector.on("end", async (_, reason) => {
      unregisterGame(interaction.channelId);
      if (reason === "stopped") {
        await interaction.editReply({
          embeds: [new EmbedBuilder().setColor(0x99AAB5).setTitle("🛑 Дуэль остановлена").setDescription("Дуэль была принудительно завершена.")],
          components: [],
        });
        return;
      }
      if (submissions.size === 0) {
        await interaction.editReply({
          embeds: [new EmbedBuilder().setColor(0x99AAB5).setTitle("😴 Дуэль не состоялась").setDescription("Никто не прислал ответ!")],
        });
        return;
      }

      if (submissions.size === 1) {
        const submittedId = [...submissions.keys()][0];
        const winner = players.find((p) => p.id === submittedId)!;
        await interaction.channel?.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle("🏆 Победа по умолчанию!")
              .setDescription(`${winner} победил — соперник не сдал работу!`),
          ],
        });
        return;
      }

      const judgingEmbed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle("⚖️ ИИ выносит приговор...")
        .setDescription("Изучаю ответы участников...");

      await interaction.channel?.send({ embeds: [judgingEmbed] });

      try {
        const sub1 = submissions.get(challenger.id)!;
        const sub2 = submissions.get(opponent.id)!;
        const { winner, reason } = await judgeSubmissions(challenge, challenger, sub1, opponent, sub2);
        const loser = winner.id === challenger.id ? opponent : challenger;

        const resultEmbed = new EmbedBuilder()
          .setColor(0xFFD700)
          .setTitle(`🏆 Победитель дуэли: ${winner.displayName}!`)
          .setDescription(`**Решение ИИ:** ${reason}`)
          .addFields(
            { name: `📝 ${challenger.displayName}`, value: sub1.substring(0, 512) },
            { name: `📝 ${opponent.displayName}`, value: sub2.substring(0, 512) }
          )
          .setFooter({ text: `${winner.username} 🏆 vs 💀 ${loser.username}` });

        await interaction.channel?.send({ embeds: [resultEmbed] });
      } catch {
        await interaction.channel?.send("Не смог определить победителя. Считайте ничью!");
      }
    });
  });

  btnCollector.on("end", (collected, reason) => {
    if (reason === "time" && collected.size === 0) {
      const expiredEmbed = new EmbedBuilder()
        .setColor(0x99AAB5)
        .setTitle("⏰ Вызов истёк")
        .setDescription(`${opponent} не ответил на вызов.`);
      interaction.editReply({ embeds: [expiredEmbed], components: [] }).catch(() => {});
    }
  });
}
