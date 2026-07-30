import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  Message,
} from "discord.js";
import { geminiText } from "../ai.js";
import { registerGame, unregisterGame } from "./registry.js";

export async function handleContest(interaction: ChatInputCommandInteraction) {
  const topic = interaction.options.getString("тема", true);
  const duration = Math.min(interaction.options.getInteger("время") ?? 120, 300);

  await interaction.deferReply();

  const startEmbed = new EmbedBuilder()
    .setColor(0xF1C40F)
    .setTitle("🏆 Конкурс начался!")
    .setDescription(
      `**Тема:** ${topic}\n\n` +
      `Пишите ваши варианты прямо в этот чат!\n` +
      `⏱️ Время: **${duration} секунд**\n\n` +
      `В конце ИИ выберет победителя и объяснит почему.`
    )
    .setFooter({ text: "Первый ответ от каждого участника засчитывается" })
    .setTimestamp();

  await interaction.editReply({ embeds: [startEmbed] });

  const submissions = new Map<string, { username: string; content: string }>();

  const collector = interaction.channel!.createMessageCollector({
    time: duration * 1000,
    filter: (m: Message) => !m.author.bot && m.content.length > 0,
  });

  registerGame(interaction.channelId, "Конкурс", () => collector.stop("stopped"));

  collector.on("collect", (m: Message) => {
    if (!submissions.has(m.author.id)) {
      submissions.set(m.author.id, { username: m.author.username, content: m.content });
      m.react("📝").catch(() => {});
    }
  });

  collector.on("end", async (_, reason) => {
    unregisterGame(interaction.channelId);

    if (reason === "stopped") {
      await interaction.channel?.send({
        embeds: [new EmbedBuilder().setColor(0x99AAB5).setTitle("🛑 Конкурс остановлен")],
      });
      return;
    }

    if (submissions.size === 0) {
      await interaction.channel?.send({
        embeds: [new EmbedBuilder().setColor(0x99AAB5).setTitle("😴 Никто не участвовал в конкурсе")],
      });
      return;
    }

    const judgingEmbed = new EmbedBuilder()
      .setColor(0xF1C40F)
      .setTitle("⚖️ ИИ изучает заявки...")
      .setDescription(`Оцениваю ${submissions.size} работ по теме: "${topic}"`);

    await interaction.channel?.send({ embeds: [judgingEmbed] });

    const entries = [...submissions.values()];
    const entriesText = entries
      .map((e, i) => `${i + 1}. [${e.username}]: "${e.content}"`)
      .join("\n");

    try {
      const verdict = await geminiText(
        `Ты судья конкурса на тему: "${topic}".
Вот все заявки участников:
${entriesText}

Выбери победителя и объясни почему их ответ лучший.
Ответ строго в формате:
ПОБЕДИТЕЛЬ: [имя участника]
ПРИЧИНА: [2-3 предложения объяснения]
ЛУЧШАЯ ЦИТАТА: [выдели ключевую фразу из их работы]`
      );

      const winnerMatch = verdict.match(/ПОБЕДИТЕЛЬ:\s*(.+)/);
      const reasonMatch = verdict.match(/ПРИЧИНА:\s*([\s\S]+?)(?=ЛУЧШАЯ ЦИТАТА:|$)/);
      const quoteMatch = verdict.match(/ЛУЧШАЯ ЦИТАТА:\s*(.+)/);

      const winnerName = winnerMatch?.[1]?.trim() ?? entries[0].username;
      const reason = reasonMatch?.[1]?.trim() ?? "Лучший участник!";
      const quote = quoteMatch?.[1]?.trim() ?? "";

      const winnerEntry = entries.find((e) => e.username.toLowerCase() === winnerName.toLowerCase()) ?? entries[0];

      const resultEmbed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle(`🏆 Победитель конкурса: ${winnerEntry.username}!`)
        .setDescription(
          `**Тема:** ${topic}\n\n` +
          `**Работа победителя:**\n> ${winnerEntry.content}\n\n` +
          `**Решение ИИ:** ${reason}` +
          (quote ? `\n\n**Лучшая фраза:** _"${quote}"_` : "")
        )
        .addFields({
          name: `📊 Все участники (${entries.length})`,
          value: entries.map((e) => `• **${e.username}:** ${e.content.substring(0, 80)}`).join("\n").substring(0, 1000),
        })
        .setFooter({ text: "Судья: Gemini AI" })
        .setTimestamp();

      await interaction.channel?.send({ embeds: [resultEmbed] });
    } catch {
      await interaction.channel?.send("Судья сломался. Победила дружба.");
    }
  });
}
