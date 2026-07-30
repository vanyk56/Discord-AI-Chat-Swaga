import {
  ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import { geminiJSON } from "../ai.js";

interface FortuneData {
  title: string;
  prediction: string;
  lucky_number: number;
  lucky_color: string;
  advice: string;
  emoji: string;
}

const FORTUNE_COLORS = [
  0xFF6B9D, 0x6BCB77, 0x4D96FF, 0xFFD93D,
  0xFF6B35, 0xC77DFF, 0x4CC9F0, 0xF72585,
];

export async function handleFortune(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const username = interaction.user.displayName;

  let fortune: FortuneData;
  try {
    fortune = await geminiJSON<FortuneData>(
      `Составь шуточное (но доброе) предсказание судьбы для пользователя по имени "${username}" из Discord.
Будь творческим, смешным и оригинальным. Можно использовать абсурд и юмор.
Верни JSON:
{
  "title": "название предсказания (макс 40 символов, с эмодзи)",
  "prediction": "основное предсказание (2-3 предложения, интригующе и смешно)",
  "lucky_number": <счастливое число от 1 до 999>,
  "lucky_color": "счастливый цвет (одно слово)",
  "advice": "совет на сегодня (одно забавное предложение)",
  "emoji": "одно эмодзи символизирующее это предсказание"
}`
    );
  } catch {
    await interaction.editReply("Звёзды сегодня молчат... Попробуй ещё раз! 🌟");
    return;
  }

  const color = FORTUNE_COLORS[Math.floor(Math.random() * FORTUNE_COLORS.length)];

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${fortune.emoji} ${fortune.title}`)
    .setDescription(`${interaction.user}, вот твоё предсказание:\n\n${fortune.prediction}`)
    .addFields(
      { name: "🎲 Счастливое число", value: fortune.lucky_number.toString(), inline: true },
      { name: "🎨 Счастливый цвет", value: fortune.lucky_color, inline: true },
      { name: "💡 Совет дня", value: fortune.advice },
    )
    .setFooter({ text: "Предсказание создано ИИ для развлечения • Не является астрологической консультацией 😄" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}
