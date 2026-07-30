import { GuildMember, Collection, EmbedBuilder } from "discord.js";
import { geminiText } from "../ai.js";
import * as fs from "fs";
import * as path from "path";

// ─── STATE PERSISTENCE ────────────────────────────────────────────────────────

const STATE_FILE = path.resolve("data/autorole-state.json");

function loadState(): Collection<string, boolean> {
  const col = new Collection<string, boolean>();
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, "utf-8");
      const obj = JSON.parse(raw) as Record<string, boolean>;
      console.log("[AutoRole] Loaded state from disk:", obj);
      for (const [k, v] of Object.entries(obj)) col.set(k, v);
    }
  } catch {
    console.warn("[AutoRole] Failed to load state, starting fresh.");
  }
  return col;
}

function saveState(col: Collection<string, boolean>): void {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    const obj: Record<string, boolean> = {};
    col.forEach((v, k) => { obj[k] = v; });
    fs.writeFileSync(STATE_FILE, JSON.stringify(obj, null, 2), "utf-8");
  } catch (e) {
    console.error("[AutoRole] Failed to save state:", e);
  }
}

export const autoRoleGuilds: Collection<string, boolean> = loadState();

export function setAutoRole(guildId: string, enabled: boolean): void {
  autoRoleGuilds.set(guildId, enabled);
  saveState(autoRoleGuilds);
}

// ─── COLORS ───────────────────────────────────────────────────────────────────

const EPIC_COLORS = [
  0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0xe67e22,
  0x9b59b6, 0x1abc9c, 0xe91e63, 0x00bcd4, 0xff5722,
  0x8bc34a, 0x673ab7, 0xff9800, 0x03a9f4, 0x4caf50,
  0xf44336, 0x9c27b0, 0x009688, 0xffc107, 0x3f51b5,
];

function randomColor(): number {
  return EPIC_COLORS[Math.floor(Math.random() * EPIC_COLORS.length)];
}

// ─── AI ROLE GENERATION ───────────────────────────────────────────────────────

async function generateRoleName(username: string): Promise<string> {
  const vibes = [
    "плаги, барыги, гучи, прада, дольче, чёрный рынок, дилер, кидала, барахолка",
    "насикал в уши, обнял батю, продал маму, потерял паспорт, забыл пин-код",
    "дворовый философ, гений двора, уличный поэт, подъездный босс, гопник с принципами",
    "подшконочник, водолаз, воздухан, упоролся в падике, чифирщик, шнырь, баклан, торпеда",
    "крутой чувак, местный блогер, телеграм-криминал, инстаграм-голодранец, ютуб-легенда",
    "мамин любимчик, папина гордость, бабушкин пирожок, дядин позор, соседский кошмар",
  ];

  const prompt = `Придумай одну смешную, дерзкую и абсурдную роль для пользователя с ником "${username}" в Discord.
Роль должна звучать как уличное или дворовое прозвище — с юмором, иронией, приколом.
Вдохновляйся этим стилем: ${vibes[Math.floor(Math.random() * vibes.length)]}
Примеры готовых ролей: Плаг Женя, Гучи Насикал в Уши, Местный Кидала, Барыга с Принципами, Сосед Снизу, Дворовый Философ, Потерял Паспорт, Обнял Батю, Криминальный Бухгалтер, Мамин Дилер, Гений Подъезда, Подшконочник Федя, Главный Водолаз, Воздухан Районного Масштаба, Упоролся в Падике, Шнырь Подъезда.
Ответь ТОЛЬКО названием роли (2-5 слов), без пояснений и кавычек.
Пиши на русском языке.`;

  try {
    const result = await geminiText(prompt);
    const cleaned = result.trim().replace(/["«»]/g, "").slice(0, 50);
    return cleaned || fallbackRoleName();
  } catch {
    return fallbackRoleName();
  }
}

function fallbackRoleName(): string {
  const roles = [
    "Подшконочник Федя", "Главный Водолаз", "Воздухан Районного Масштаба",
    "Упоролся в Падике", "Шнырь Подъезда", "Плаг Женя", "Гучи Насикал в Уши",
    "Местный Кидала", "Барыга с Принципами", "Дворовый Философ",
    "Криминальный Бухгалтер", "Мамин Дилер", "Гений Подъезда",
    "Сосед Снизу", "Потерял Паспорт", "Обнял Батю", "Чифирщик Серёга",
    "Торпеда без Тормозов", "Баклан Ночного Района", "Уличный Поэт",
  ];
  return roles[Math.floor(Math.random() * roles.length)];
}

// ─── BULK ASSIGN ──────────────────────────────────────────────────────────────

export async function assignRolesToAll(
  guild: import("discord.js").Guild,
  onProgress?: (done: number, total: number, last: string) => void
): Promise<{ assigned: number; skipped: number }> {
  const me = guild.members.me;
  if (!me?.permissions.has(BigInt(0x10000000))) return { assigned: 0, skipped: 0 };

  await guild.members.fetch();

  const targets = guild.members.cache.filter(
    (m) => !m.user.bot && m.roles.cache.size <= 1 // only @everyone
  );

  let assigned = 0;
  let skipped = 0;
  const total = targets.size;

  for (const [, member] of targets) {
    try {
      const roleName = await generateRoleName(member.user.username);
      const color = randomColor();

      const role = await guild.roles.create({
        name: roleName,
        color,
        mentionable: false,
        hoist: false,
        reason: `Массовая авто-роль для ${member.user.tag}`,
      });

      await member.roles.add(role, "Массовая авто-выдача уникальной роли");
      assigned++;

      console.log(`[AutoRole] Выдано "${roleName}" для ${member.user.tag}`);
      onProgress?.(assigned + skipped, total, `${member.user.username} → **${roleName}**`);

      // небольшая пауза чтобы не флудить Discord API
      await new Promise((r) => setTimeout(r, 1200));
    } catch (err) {
      console.error(`[AutoRole] Ошибка для ${member.user.tag}:`, err);
      skipped++;
    }
  }

  return { assigned, skipped };
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

export async function assignAutoRole(member: GuildMember): Promise<void> {
  if (!autoRoleGuilds.get(member.guild.id)) return;

  const me = member.guild.members.me;
  if (!me?.permissions.has(BigInt(0x10000000))) return; // ManageRoles

  try {
    const roleName = await generateRoleName(member.user.username);
    const color = randomColor();

    const role = await member.guild.roles.create({
      name: roleName,
      color,
      mentionable: false,
      hoist: false,
      reason: `Авто-роль для ${member.user.tag}`,
    });

    await member.roles.add(role, "Авто-выдача уникальной роли");

    console.log(`[AutoRole] Создана роль "${roleName}" для ${member.user.tag} на ${member.guild.name}`);

    const systemChannel = member.guild.systemChannel;
    if (systemChannel) {
      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle("🎭 Свежий титул!")
        .setDescription(`<@${member.id}> отныне известен как **${roleName}**`)
        .setFooter({ text: "Роль придумана специально для тебя" })
        .setTimestamp();

      await systemChannel.send({ embeds: [embed] }).catch(() => {});
    }
  } catch (error) {
    console.error("[AutoRole] Ошибка при создании роли:", error);
  }
}
