import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  AttachmentBuilder,
} from "discord.js";
import { geminiText, geminiJSON, geminiGenerateImage } from "../ai.js";

function mimeToExtension(mimeType: string) {
  return ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" })[mimeType] ?? "png";
}

// ─── /meme ────────────────────────────────────────────────────────────────────

export async function handleMeme(interaction: ChatInputCommandInteraction) {
  const description = interaction.options.getString("описание", true);
  await interaction.deferReply();

  interface MemeText {
    top: string;
    bottom: string;
    image_prompt: string;
  }

  try {
    const memeData = await geminiJSON<MemeText>(
      `Создай мем по описанию: "${description}".
Верни JSON:
{
  "top": "текст в верхней части мема (короткий, до 60 символов)",
  "bottom": "текст в нижней части мема (панчлайн, до 60 символов)",
  "image_prompt": "описание изображения для мема на английском, детально, без текста на картинке"
}
Текст мема должен быть смешным, метким и подходящим к описанию.`
    );

    const imagePrompt = `${memeData.image_prompt}. Meme style image, funny, expressive faces or situations, bold and clear visual. No text on the image.`;
    const result = await geminiGenerateImage(imagePrompt);

    if (result) {
      const ext = mimeToExtension(result.mimeType);
      const embed = new EmbedBuilder()
        .setColor(0xFF6B35)
        .setTitle("😂 Мем готов!")
        .addFields(
          { name: "⬆️ Верх", value: memeData.top },
          { name: "⬇️ Низ", value: memeData.bottom },
        )
        .setImage(`attachment://meme.${ext}`)
        .setFooter({ text: `Тема: ${description}` });

      await interaction.editReply({
        embeds: [embed],
        files: [new AttachmentBuilder(result.buffer, { name: `meme.${ext}` })],
      });
    } else {
      const embed = new EmbedBuilder()
        .setColor(0xFF6B35)
        .setTitle("😂 Мем")
        .setDescription(`**${memeData.top}**\n\n*(картинка)*\n\n**${memeData.bottom}**`)
        .setFooter({ text: `Тема: ${description}` });

      await interaction.editReply({ embeds: [embed] });
    }
  } catch {
    await interaction.editReply("Не смог создать мем. Попробуй другое описание!");
  }
}

// ─── /comic ───────────────────────────────────────────────────────────────────

export async function handleComic(interaction: ChatInputCommandInteraction) {
  const scenario = interaction.options.getString("сценарий", true);
  await interaction.deferReply();

  interface ComicPanel {
    panel: number;
    scene: string;
    dialogue: string;
    image_prompt: string;
  }

  interface ComicScript {
    title: string;
    panels: ComicPanel[];
  }

  try {
    const script = await geminiJSON<ComicScript>(
      `Создай сценарий короткого комикса (3 панели) по теме: "${scenario}".
Верни JSON:
{
  "title": "название комикса",
  "panels": [
    {
      "panel": 1,
      "scene": "описание сцены (что происходит визуально)",
      "dialogue": "диалог или мысли персонажа (в кавычках)",
      "image_prompt": "детальное описание иллюстрации для этой панели на английском"
    }
  ]
}
Комикс должен быть смешным, с неожиданной концовкой. Ровно 3 панели.`
    );

    const imagePrompt = `${script.panels[0].image_prompt}. Comic book style, colorful, cartoon illustration, clean lines, expressive characters.`;
    const result = await geminiGenerateImage(imagePrompt);

    const panelFields = script.panels.map((p) => ({
      name: `🖼️ Панель ${p.panel}`,
      value: `*${p.scene}*\n💬 ${p.dialogue}`,
    }));

    const embed = new EmbedBuilder()
      .setColor(0x4CC9F0)
      .setTitle(`📖 ${script.title}`)
      .addFields(...panelFields)
      .setFooter({ text: `Сценарий: ${scenario}` });

    if (result) {
      const ext = mimeToExtension(result.mimeType);
      embed.setImage(`attachment://comic.${ext}`).setDescription("*Обложка первой панели:*");
      await interaction.editReply({
        embeds: [embed],
        files: [new AttachmentBuilder(result.buffer, { name: `comic.${ext}` })],
      });
    } else {
      await interaction.editReply({ embeds: [embed] });
    }
  } catch {
    await interaction.editReply("Не смог создать комикс. Попробуй другой сценарий!");
  }
}

// ─── /avatar ──────────────────────────────────────────────────────────────────

export async function handleAvatar(interaction: ChatInputCommandInteraction) {
  const description = interaction.options.getString("описание", true);
  const style = interaction.options.getString("стиль") ?? "anime";
  await interaction.deferReply();

  const stylePrompts: Record<string, string> = {
    anime: "anime style avatar, clean lines, vibrant colors, expressive eyes, Japanese animation style",
    pixel: "pixel art avatar, 32x32 pixels style, retro game character, detailed pixel art",
    realistic: "realistic portrait avatar, photorealistic, professional headshot style, detailed",
    cartoon: "cartoon avatar, bold outlines, flat colors, fun and playful style",
    fantasy: "fantasy RPG character avatar, detailed armor or robes, magical aura, epic style",
    cyberpunk: "cyberpunk avatar, neon lights, futuristic, dark background, glowing accents",
  };

  const styleDesc = stylePrompts[style] ?? stylePrompts["anime"];

  try {
    const prompt = `Profile avatar: ${description}. ${styleDesc}. Square format, face centered, highly detailed, avatar suitable for profile picture.`;
    const result = await geminiGenerateImage(prompt);

    if (result) {
      const ext = mimeToExtension(result.mimeType);
      const embed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle("🎨 Аватарка готова!")
        .setDescription(`**Стиль:** ${style}\n**Описание:** ${description}`)
        .setImage(`attachment://avatar.${ext}`)
        .setFooter({ text: "Сохрани изображение и установи как фото профиля!" });

      await interaction.editReply({
        embeds: [embed],
        files: [new AttachmentBuilder(result.buffer, { name: `avatar.${ext}` })],
      });
    } else {
      await interaction.editReply("Не смог создать аватарку. Попробуй другое описание!");
    }
  } catch {
    await interaction.editReply("Ошибка при создании аватарки. Попробуй ещё раз!");
  }
}
