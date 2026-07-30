import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  ColorResolvable,
} from "discord.js";

const COLOR_NAMES: Record<string, string> = {
  // Русские названия
  красный: "#e74c3c", красный2: "#ff0000",
  синий: "#3498db", синий2: "#0000ff",
  зелёный: "#2ecc71", зеленый: "#2ecc71",
  жёлтый: "#f1c40f", желтый: "#f1c40f",
  оранжевый: "#e67e22",
  фиолетовый: "#7c249fff",
  розовый: "#ff69b4",
  голубой: "#1abc9c",
  белый: "#ffffff",
  чёрный: "#000000", черный: "#000000",
  серый: "#95a5a6", серый2: "#808080",
  золотой: "#ffd700", золото: "#ffd700",
  бирюзовый: "#1abc9c",
  малиновый: "#c0392b",
  лавандовый: "#7d3cad",
  // English names
  red: "#e74c3c",
  blue: "#3498db",
  green: "#2ecc71",
  yellow: "#f1c40f",
  orange: "#e67e22",
  purple: "#9b59b6",
  pink: "#ff69b4",
  cyan: "#1abc9c",
  white: "#ffffff",
  black: "#000000",
  gray: "#95a5a6", grey: "#95a5a6",
  gold: "#ffd700",
  teal: "#1abc9c",
  aqua: "#00ffff",
  magenta: "#ff00ff",
  lime: "#00ff00",
  navy: "#001f5b",
  maroon: "#800000",
  lavender: "#7d3cad",
};

function parseColor(input: string): ColorResolvable | null {
  const lower = input.trim().toLowerCase();
  if (COLOR_NAMES[lower]) return COLOR_NAMES[lower] as ColorResolvable;
  const cleaned = lower.startsWith("#") ? lower : `#${lower}`;
  if (/^#[0-9a-f]{6}$/.test(cleaned)) return cleaned as ColorResolvable;
  return null;
}

export async function handleRoleCreate(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  const me = interaction.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({ content: "❌ У бота нет прав на управление ролями.", ephemeral: true });
  }

  const name = interaction.options.getString("название", true);
  const colorInput = interaction.options.getString("цвет") ?? "#99aab5";
  const color = parseColor(colorInput) ?? "#99aab5";
  const mentionable = interaction.options.getBoolean("упоминаемая") ?? false;
  const hoist = interaction.options.getBoolean("отдельно") ?? false;

  try {
    const role = await interaction.guild.roles.create({
      name,
      color: color as ColorResolvable,
      mentionable,
      hoist,
      reason: `Создано ботом по запросу ${interaction.user.tag}`,
    });

    const embed = new EmbedBuilder()
      .setColor(role.color || 0x5865f2)
      .setTitle("✅ Роль создана")
      .addFields(
        { name: "Название", value: role.name, inline: true },
        { name: "Цвет", value: colorInput, inline: true },
        { name: "ID", value: role.id, inline: true },
        { name: "Упоминаемая", value: mentionable ? "Да" : "Нет", inline: true },
        { name: "Отдельно в списке", value: hoist ? "Да" : "Нет", inline: true },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    await interaction.reply({ content: `❌ Ошибка при создании роли: ${(err as Error).message}`, ephemeral: true });
  }
}

export async function handleRoleDelete(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  const me = interaction.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({ content: "❌ У бота нет прав на управление ролями.", ephemeral: true });
  }

  const role = interaction.options.getRole("роль", true);
  const guildRole = interaction.guild.roles.cache.get(role.id);

  if (!guildRole) {
    return interaction.reply({ content: "❌ Роль не найдена.", ephemeral: true });
  }

  if (guildRole.position >= (me.roles.highest.position)) {
    return interaction.reply({ content: "❌ Невозможно удалить роль выше или равную роли бота.", ephemeral: true });
  }

  try {
    const roleName = guildRole.name;
    await guildRole.delete(`Удалено ботом по запросу ${interaction.user.tag}`);

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("🗑️ Роль удалена")
      .setDescription(`Роль **${roleName}** успешно удалена.`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    await interaction.reply({ content: `❌ Ошибка при удалении роли: ${(err as Error).message}`, ephemeral: true });
  }
}

export async function handleRoleEdit(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  const me = interaction.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({ content: "❌ У бота нет прав на управление ролями.", ephemeral: true });
  }

  const role = interaction.options.getRole("роль", true);
  const guildRole = interaction.guild.roles.cache.get(role.id);

  if (!guildRole) {
    return interaction.reply({ content: "❌ Роль не найдена.", ephemeral: true });
  }

  if (guildRole.position >= me.roles.highest.position) {
    return interaction.reply({ content: "❌ Невозможно редактировать роль выше или равную роли бота.", ephemeral: true });
  }

  const newName = interaction.options.getString("новое-название");
  const colorInput = interaction.options.getString("цвет");
  const mentionable = interaction.options.getBoolean("упоминаемая");
  const hoist = interaction.options.getBoolean("отдельно");

  const updates: Record<string, unknown> = {};
  if (newName) updates.name = newName;
  if (colorInput) {
    const color = parseColor(colorInput);
    if (!color) return interaction.reply({ content: "❌ Неверный формат цвета. Используй HEX, например `#ff5733`.", ephemeral: true });
    updates.color = color;
  }
  if (mentionable !== null) updates.mentionable = mentionable;
  if (hoist !== null) updates.hoist = hoist;

  if (Object.keys(updates).length === 0) {
    return interaction.reply({ content: "❌ Укажи хотя бы один параметр для изменения.", ephemeral: true });
  }

  try {
    await guildRole.edit({ ...updates, reason: `Изменено ботом по запросу ${interaction.user.tag}` });

    const embed = new EmbedBuilder()
      .setColor(guildRole.color || 0x5865f2)
      .setTitle("✏️ Роль обновлена")
      .setDescription(`Роль <@&${guildRole.id}> успешно изменена.`)
      .addFields(
        { name: "Название", value: guildRole.name, inline: true },
        { name: "Цвет", value: `#${guildRole.color.toString(16).padStart(6, "0")}`, inline: true },
        { name: "ID", value: guildRole.id, inline: true },
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    await interaction.reply({ content: `❌ Ошибка при редактировании роли: ${(err as Error).message}`, ephemeral: true });
  }
}

export async function handleRoleGive(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  const me = interaction.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({ content: "❌ У бота нет прав на управление ролями.", ephemeral: true });
  }

  const user = interaction.options.getUser("участник", true);
  const role = interaction.options.getRole("роль", true);
  const guildRole = interaction.guild.roles.cache.get(role.id);

  if (!guildRole) {
    return interaction.reply({ content: "❌ Роль не найдена.", ephemeral: true });
  }

  if (guildRole.position >= me.roles.highest.position) {
    return interaction.reply({ content: "❌ Невозможно выдать роль выше или равную роли бота.", ephemeral: true });
  }

  try {
    const member = await interaction.guild.members.fetch(user.id);
    if (member.roles.cache.has(guildRole.id)) {
      return interaction.reply({ content: `❌ У **${user.displayName}** уже есть эта роль.`, ephemeral: true });
    }

    await member.roles.add(guildRole, `Выдано ботом по запросу ${interaction.user.tag}`);

    const embed = new EmbedBuilder()
      .setColor(guildRole.color || 0x57f287)
      .setTitle("✅ Роль выдана")
      .setDescription(`**${user.displayName}** получил роль <@&${guildRole.id}>`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    await interaction.reply({ content: `❌ Ошибка: ${(err as Error).message}`, ephemeral: true });
  }
}

export async function handleRoleTake(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  const me = interaction.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return interaction.reply({ content: "❌ У бота нет прав на управление ролями.", ephemeral: true });
  }

  const user = interaction.options.getUser("участник", true);
  const role = interaction.options.getRole("роль", true);
  const guildRole = interaction.guild.roles.cache.get(role.id);

  if (!guildRole) {
    return interaction.reply({ content: "❌ Роль не найдена.", ephemeral: true });
  }

  if (guildRole.position >= me.roles.highest.position) {
    return interaction.reply({ content: "❌ Невозможно забрать роль выше или равную роли бота.", ephemeral: true });
  }

  try {
    const member = await interaction.guild.members.fetch(user.id);
    if (!member.roles.cache.has(guildRole.id)) {
      return interaction.reply({ content: `❌ У **${user.displayName}** нет этой роли.`, ephemeral: true });
    }

    await member.roles.remove(guildRole, `Забрано ботом по запросу ${interaction.user.tag}`);

    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("🚫 Роль забрана")
      .setDescription(`У **${user.displayName}** забрана роль <@&${guildRole.id}>`)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    await interaction.reply({ content: `❌ Ошибка: ${(err as Error).message}`, ephemeral: true });
  }
}

export async function handleRoleList(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild) return;

  await interaction.guild.roles.fetch();
  const roles = interaction.guild.roles.cache
    .filter((r) => r.id !== interaction.guild!.id)
    .sort((a, b) => b.position - a.position);

  if (roles.size === 0) {
    return interaction.reply({ content: "На сервере нет ролей.", ephemeral: true });
  }

  const chunks: string[] = [];
  let current = "";
  for (const [, role] of roles) {
    const line = `<@&${role.id}> — ${role.members.size} чел.\n`;
    if ((current + line).length > 1000) {
      chunks.push(current);
      current = line;
    } else {
      current += line;
    }
  }
  if (current) chunks.push(current);

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`📋 Роли сервера (${roles.size})`)
    .setDescription(chunks[0] ?? "Нет ролей")
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}
