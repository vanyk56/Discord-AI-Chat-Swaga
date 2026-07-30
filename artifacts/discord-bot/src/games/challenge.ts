import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  Message,
} from "discord.js";
import { geminiJSON } from "../ai.js";
import { registerGame, unregisterGame } from "./registry.js";

interface Challenge {
  title: string;
  task: string;
  duration: number;
  judgeBy: string;
}

async function generateChallenge(): Promise<Challenge> {
  return geminiJSON<Challenge>(`Придумай смешное и выполнимое испытание для всех участников Discord чата.
Задание должно быть выполнимо текстом за 60-120 секунд.
Верни JSON:
{
  "title": "название испытания (до 40 символов)",
  "task": "что нужно сделать (2-3 предложения, конкретно и смешно)",
  "duration": 90,
  "judgeBy": "как определить победителя (1 предложение)"
}
Примеры: написать хайку про картошку, придумать слоган для ЖЭКа, описать себя как товар на Авито, написать резюме для должности 'хранитель подъезда'.`);
}

export async function handleChallenge(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  let challenge: Challenge;
  try {
    challenge = await generateChallenge();
  } catch {
    await interaction.editReply("Не смог придумать испытание. Генератор заданий ушёл в отпуск.");
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xFF9800)
    .setTitle(`⚡ ${challenge.title}`)
    .setDescription(
      `**Задание:**\n${challenge.task}\n\n` +
      `**Победитель определяется:** ${challenge.judgeBy}\n\n` +
      `⏱️ Время: **${challenge.duration} секунд** — пишите ответы прямо сюда!`
    )
    .setFooter({ text: "Старт! Все участники могут участвовать" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });

  const submissions = new Map<string, { username: string; content: string }>();

  const collector = interaction.channel!.createMessageCollector({
    time: challenge.duration * 1000,
    filter: (m: Message) => !m.author.bot && m.content.length > 0,
  });

  registerGame(interaction.channelId, "Испытание", () => collector.stop("stopped"));

  collector.on("collect", (m: Message) => {
    if (!submissions.has(m.author.id)) {
      submissions.set(m.author.id, { username: m.author.username, content: m.content });
      m.react("✅").catch(() => {});
    }
  });

  collector.on("end", async (_, reason) => {
    unregisterGame(interaction.channelId);

    if (reason === "stopped") {
      await interaction.channel?.send({
        embeds: [new EmbedBuilder().setColor(0x99AAB5).setTitle("🛑 Испытание остановлено")],
      });
      return;
    }

    if (submissions.size === 0) {
      await interaction.channel?.send({
        embeds: [new EmbedBuilder().setColor(0x99AAB5).setTitle("😴 Никто не участвовал").setDescription("Все либо заняты, либо испугались.")],
      });
      return;
    }

    const resultEmbed = new EmbedBuilder()
      .setColor(0xFF9800)
      .setTitle(`⏰ Испытание «${challenge.title}» завершено!`)
      .setDescription(
        `Участвовало: **${submissions.size}** человек\n\n` +
        [...submissions.values()]
          .slice(0, 10)
          .map((s, i) => `**${i + 1}. ${s.username}:** ${s.content.substring(0, 150)}`)
          .join("\n\n")
      )
      .setFooter({ text: `Победителя выбирает сообщество — реакциями!` });

    await interaction.channel?.send({ embeds: [resultEmbed] });
  });
}
