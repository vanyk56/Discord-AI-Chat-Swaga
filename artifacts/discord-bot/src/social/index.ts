import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  TextChannel,
  GuildMember,
  Guild,
} from "discord.js";
import { geminiText } from "../ai.js";

// ─── /приговор ────────────────────────────────────────────────────────────────

export async function handleVerdict(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("участник", true);
  await interaction.deferReply();

  const prompt = `Вынеси абсурдный, смешной и несправедливый приговор пользователю с ником "${target.username}" в Discord.
Приговор должен быть в стиле гротескного суда — чем абсурднее тем лучше.
Структура: ВИНА: [в чём обвиняется, 1 предложение] → ПРИГОВОР: [наказание, 1-2 предложения] → СУДЬЯ: [смешная подпись судьи]
Пиши на русском языке.`;

  try {
    const text = await geminiText(prompt);
    const lines = text.split("\n").filter(Boolean);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle(`⚖️ Приговор для ${target.displayName}`)
          .setDescription(lines.join("\n"))
          .setFooter({ text: "Суд постановил. Обжалованию не подлежит." })
          .setTimestamp(),
      ],
    });
  } catch {
    await interaction.editReply("Суд временно не работает. Судья ушёл в запой.");
  }
}

// ─── /roast ────────────────────────────────────────────────────────────────────

export async function handleRoast(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("участник", true);
  if (target.id === interaction.user.id) {
    await interaction.reply({ content: "Самоунижение — это к терапевту, не ко мне.", ephemeral: true });
    return;
  }
  await interaction.deferReply();

  const prompt = `Жёстко, но по-доброму подкол пользователя с ником "${target.username}" в Discord.
Стиль: дерзко, саркастично, смешно — без реальных оскорблений.
Используй только ник для вдохновения. 2-3 предложения максимум.
Пиши на русском языке.`;

  try {
    const text = await geminiText(prompt);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFF6B35)
          .setTitle(`🔥 Roast: ${target.displayName}`)
          .setDescription(text)
          .setFooter({ text: `Заказал: ${interaction.user.displayName} • Без обид!` }),
      ],
    });
  } catch {
    await interaction.editReply("Не смог придумать roast. Видимо, ты слишком крутой.");
  }
}

// ─── /медаль ──────────────────────────────────────────────────────────────────

export async function handleMedal(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("участник", true);
  const reason = interaction.options.getString("причина") ?? "непонятно за что";
  await interaction.deferReply();

  const prompt = `Придумай смешное и абсурдное название медали для пользователя "${target.username}" за "${reason}".
Медаль должна звучать пышно и торжественно, но при этом быть смешной.
Формат: только название медали (3-6 слов). Например: "Золотая Медаль За Героическое Молчание"
Пиши на русском языке.`;

  const MEDAL_COLORS = [0xFFD700, 0xC0C0C0, 0xCD7F32, 0x9B59B6, 0x3498DB];
  const color = MEDAL_COLORS[Math.floor(Math.random() * MEDAL_COLORS.length)];

  try {
    const medalName = (await geminiText(prompt)).trim().replace(/["«»]/g, "");
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(color)
          .setTitle("🏅 Торжественная Церемония Награждения")
          .setDescription(
            `С великой гордостью и без всякого стыда объявляем:\n\n` +
            `<@${target.id}> удостоен(а) почётной награды\n` +
            `# ${medalName}\n\n` +
            `**За:** ${reason}`
          )
          .setFooter({ text: `Вручил: ${interaction.user.displayName}` })
          .setTimestamp(),
      ],
    });
  } catch {
    await interaction.editReply("Церемония отменена по техническим причинам.");
  }
}

// ─── /аватар-вайб ─────────────────────────────────────────────────────────────

export async function handleVibeCheck(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("участник") ?? interaction.user;
  await interaction.deferReply();

  const prompt = `Опиши "ауру" и "вайб" пользователя Discord с ником "${target.username}".
Будь творческим, смешным и абсурдным. Описывай как будто чувствуешь энергетику через экран.
Включи: основная аура (1 слово), уровень загадочности (%), главная суперсила, слабость, предсказание.
Пиши стильно и смешно, 4-5 строк. Пиши на русском языке.`;

  const VIBE_COLORS = [0x9B59B6, 0x1ABC9C, 0x3498DB, 0xE91E63, 0xFF9800];
  const color = VIBE_COLORS[Math.floor(Math.random() * VIBE_COLORS.length)];

  try {
    const text = await geminiText(prompt);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(color)
          .setTitle(`🔮 Аура-анализ: ${target.displayName}`)
          .setDescription(text)
          .setThumbnail(target.displayAvatarURL())
          .setFooter({ text: "Точность анализа: 100% (данные могут не соответствовать реальности)" }),
      ],
    });
  } catch {
    await interaction.editReply("Аура слишком мощная — сканер сгорел.");
  }
}

// ─── /совместимость ───────────────────────────────────────────────────────────

export async function handleCompatibility(interaction: ChatInputCommandInteraction) {
  const user1 = interaction.options.getUser("участник1", true);
  const user2 = interaction.options.getUser("участник2", true);
  await interaction.deferReply();

  const percent = Math.floor(Math.random() * 101);

  const prompt = `Определи совместимость между двумя пользователями Discord: "${user1.username}" и "${user2.username}".
Совместимость: ${percent}%.
Придумай смешное объяснение почему именно такой процент.
Добавь: в чём они похожи, в чём противоположны, и чем их союз закончится.
3-4 предложения. Пиши на русском языке.`;

  const color = percent >= 70 ? 0x2ECC71 : percent >= 40 ? 0xF1C40F : 0xED4245;
  const emoji = percent >= 70 ? "💑" : percent >= 40 ? "🤝" : "💀";

  try {
    const text = await geminiText(prompt);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(color)
          .setTitle(`${emoji} Совместимость`)
          .setDescription(
            `**${user1.displayName}** ❤️ **${user2.displayName}**\n\n` +
            `## ${percent}%\n` +
            `${"█".repeat(Math.floor(percent / 5))}${"░".repeat(20 - Math.floor(percent / 5))} ${percent}%\n\n` +
            text
          )
          .setTimestamp(),
      ],
    });
  } catch {
    await interaction.editReply("Вселенная отказалась комментировать эти отношения.");
  }
}

// ─── COUPLE ROLE HELPER ───────────────────────────────────────────────────────

const COUPLE_COLORS = [
  0xE91E63, 0xFF69B4, 0xFF1493, 0xC71585, 0xFF4081,
  0xF06292, 0xAD1457, 0xEC407A, 0xFF80AB, 0xF48FB1,
];

async function createCoupleRole(
  guild: Guild,
  m1: GuildMember,
  m2: GuildMember,
  label: string
): Promise<void> {
  const color = COUPLE_COLORS[Math.floor(Math.random() * COUPLE_COLORS.length)];
  const role = await guild.roles.create({
    name: label,
    color,
    mentionable: true,
    hoist: false,
    reason: "Общая роль для пары",
  });
  await m1.roles.add(role);
  await m2.roles.add(role);
}

// ─── /пара ────────────────────────────────────────────────────────────────────

export async function handlePair(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: "Только для серверов!", ephemeral: true });
    return;
  }
  await interaction.deferReply();

  try {
    await interaction.guild.members.fetch();
    const humans = interaction.guild.members.cache.filter((m) => !m.user.bot);

    if (humans.size < 2) {
      await interaction.editReply("На сервере слишком мало людей для спаривания!");
      return;
    }

    const arr = [...humans.values()];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }

    const p1 = arr[0];
    const p2 = arr[1];

    const prompt = `Придумай смешное и абсурдное "предназначение" для пары: "${p1.user.username}" и "${p2.user.username}".
Почему именно они? Что их объединяет? Какое их совместное будущее?
2-3 предложения, с юмором. Пиши на русском языке.`;

    const text = await geminiText(prompt);

    const roleLabel = `💕 ${p1.user.username} & ${p2.user.username}`.slice(0, 100);
    let roleCreated = false;
    try {
      await createCoupleRole(interaction.guild, p1, p2, roleLabel);
      roleCreated = true;
    } catch {
      // no ManageRoles permission — skip role creation
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xE91E63)
          .setTitle("💘 Пара дня!")
          .setDescription(
            `Вселенная решила: сегодняшняя пара — это\n\n` +
            `# <@${p1.id}> 💕 <@${p2.id}>\n\n` +
            text +
            (roleCreated ? `\n\n✨ Им выдана общая роль **${roleLabel}**` : "")
          )
          .setFooter({ text: "Пары перемешиваются каждый день" })
          .setTimestamp(),
      ],
    });
  } catch {
    await interaction.editReply("Не удалось найти пару. Все заняты.");
  }
}

// ─── /поженить ────────────────────────────────────────────────────────────────

export async function handleMarry(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) {
    await interaction.reply({ content: "Только для серверов!", ephemeral: true });
    return;
  }

  const user1 = interaction.options.getUser("участник1", true);
  const user2 = interaction.options.getUser("участник2", true);

  if (user1.id === user2.id) {
    await interaction.reply({ content: "Нельзя жениться на себе. Терапевт ждёт.", ephemeral: true });
    return;
  }
  if (user1.bot || user2.bot) {
    await interaction.reply({ content: "Боты не вступают в брак (пока).", ephemeral: true });
    return;
  }

  await interaction.deferReply();

  const m1 = await interaction.guild.members.fetch(user1.id).catch(() => null);
  const m2 = await interaction.guild.members.fetch(user2.id).catch(() => null);

  if (!m1 || !m2) {
    await interaction.editReply("Один из участников не найден на сервере.");
    return;
  }

  const prompt = `Напиши торжественную и смешную речь на бракосочетании "${user1.username}" и "${user2.username}" в Discord.
Стиль: пышная церемония, но с абсурдным юмором и дерзостью. 3-4 предложения.
Пиши на русском языке.`;

  try {
    const speech = await geminiText(prompt);
    const roleLabel = `💍 ${user1.username} & ${user2.username}`.slice(0, 100);

    let roleCreated = false;
    try {
      await createCoupleRole(interaction.guild, m1, m2, roleLabel);
      roleCreated = true;
    } catch {
      // no ManageRoles permission
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFF69B4)
          .setTitle("💍 Бракосочетание!")
          .setDescription(
            `С гордостью объявляем:\n\n` +
            `# <@${user1.id}> 💍 <@${user2.id}>\n\n` +
            `*${speech}*` +
            (roleCreated ? `\n\n✨ Молодожёнам выдана общая роль **${roleLabel}**` : "")
          )
          .setFooter({ text: `Свидетель: ${interaction.user.displayName} • Поздравляем!` })
          .setTimestamp(),
      ],
    });
  } catch {
    await interaction.editReply("Регистратура временно не работает. Попробуй позже.");
  }
}

// ─── /анон ────────────────────────────────────────────────────────────────────

export async function handleAnon(interaction: ChatInputCommandInteraction) {
  const text = interaction.options.getString("сообщение", true);

  if (text.length > 500) {
    await interaction.reply({ content: "Сообщение слишком длинное (макс 500 символов).", ephemeral: true });
    return;
  }

  await interaction.reply({ content: "✅ Анонимное сообщение отправлено!", ephemeral: true });

  const channel = interaction.channel as TextChannel;
  if (!channel) return;

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x2C2F33)
        .setTitle("🕵️ Анонимное сообщение")
        .setDescription(text)
        .setFooter({ text: "Отправитель скрыт" })
        .setTimestamp(),
    ],
  });
}

// ─── /новости ─────────────────────────────────────────────────────────────────

export async function handleNews(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const serverName = interaction.guild?.name ?? "этого сервера";
  const memberCount = interaction.guild?.memberCount ?? 0;

  const prompt = `Напиши 3 абсурдные и смешные "новости" про Discord сервер "${serverName}" (${memberCount} участников).
Стиль: серьёзная газетная подача, но полный абсурд и выдумка.
Формат каждой новости: 📰 **Заголовок** — короткий текст (1 предложение).
Разделяй новости переносом строки. Пиши на русском языке.`;

  try {
    const text = await geminiText(prompt);
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x3498DB)
          .setTitle(`📰 Новости сервера ${serverName}`)
          .setDescription(text)
          .setFooter({ text: "Редакция не несёт ответственности за содержание" })
          .setTimestamp(),
      ],
    });
  } catch {
    await interaction.editReply("Редакция временно закрыта. Главный редактор потерял паспорт.");
  }
}
