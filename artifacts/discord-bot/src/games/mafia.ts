import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
  GuildMember,
  TextChannel,
  Collection,
  Snowflake,
} from "discord.js";
import { geminiText } from "../ai.js";
import { registerGame, unregisterGame } from "./registry.js";

type MafiaRole = "мафия" | "мирный" | "шериф" | "доктор";

interface Player {
  member: GuildMember;
  role: MafiaRole;
  alive: boolean;
}

function assignRoles(members: GuildMember[]): Player[] {
  const count = members.length;
  const roles: MafiaRole[] = [];

  const mafiaCount = count <= 5 ? 1 : count <= 8 ? 2 : 3;
  for (let i = 0; i < mafiaCount; i++) roles.push("мафия");
  roles.push("шериф");
  if (count >= 6) roles.push("доктор");
  while (roles.length < count) roles.push("мирный");

  const shuffled = [...roles].sort(() => Math.random() - 0.5);
  return members.map((m, i) => ({ member: m, role: shuffled[i], alive: true }));
}

function roleEmoji(role: MafiaRole): string {
  return { мафия: "🔫", мирный: "👤", шериф: "🔍", доктор: "💊" }[role];
}

async function sendRolesViaDM(players: Player[]): Promise<void> {
  for (const p of players) {
    const desc: Record<MafiaRole, string> = {
      мафия: "Ты — **мафия** 🔫. Твоя цель: уничтожить мирных жителей. Ночью голосуй кого убить (в голосовании ночью).",
      мирный: "Ты — **мирный житель** 👤. Вычисляй мафию и голосуй за их исключение днём.",
      шериф: "Ты — **шериф** 🔍. Каждую ночь ты можешь проверить одного игрока — мафия он или нет. Результат придёт в ЛС.",
      доктор: "Ты — **доктор** 💊. Каждую ночь можешь спасти одного игрока от убийства мафией.",
    };
    try {
      await p.member.send({
        embeds: [
          new EmbedBuilder()
            .setColor(p.role === "мафия" ? 0xED4245 : p.role === "шериф" ? 0xF1C40F : p.role === "доктор" ? 0x57F287 : 0x99AAB5)
            .setTitle(`🎭 Твоя роль в игре Мафия`)
            .setDescription(desc[p.role])
            .setFooter({ text: "Никому не говори свою роль!" }),
        ],
      });
    } catch {
      // DM disabled — skip
    }
  }
}

export async function handleMafia(interaction: ChatInputCommandInteraction) {
  if (!interaction.guild || !interaction.channel) {
    await interaction.reply({ content: "Только для серверов!", ephemeral: true });
    return;
  }

  const channel = interaction.channel as TextChannel;

  // ── Join phase ──────────────────────────────────────────────────────────────

  const joinBtn = new ButtonBuilder()
    .setCustomId("mafia_join")
    .setLabel("🙋 Играю!")
    .setStyle(ButtonStyle.Success);

  const startBtn = new ButtonBuilder()
    .setCustomId("mafia_start")
    .setLabel("▶️ Начать игру")
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn, startBtn);

  const joinEmbed = new EmbedBuilder()
    .setColor(0x2C2F33)
    .setTitle("🎭 Мафия — набор игроков")
    .setDescription(
      "Классическая **Мафия** прямо в Discord!\n\n" +
      "Нажми **Играю!** чтобы вступить.\n" +
      "Нужно минимум **4 игрока**. Организатор нажимает **Начать игру**.\n\n" +
      "**Роли:** 👤 Мирный, 🔫 Мафия, 🔍 Шериф, 💊 Доктор\n" +
      "Роли придут в личные сообщения!"
    )
    .setFooter({ text: "Игроки:" });

  await interaction.reply({ embeds: [joinEmbed], components: [row] });
  const msg = await interaction.fetchReply();

  const joinedIds = new Collection<Snowflake, GuildMember>();
  joinedIds.set(interaction.user.id, interaction.guild.members.cache.get(interaction.user.id)!);

  const joinCollector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 120_000,
  });

  registerGame(interaction.channelId, "Мафия", () => joinCollector.stop("stopped"));

  joinCollector.on("collect", async (btn) => {
    if (btn.customId === "mafia_join") {
      const member = interaction.guild!.members.cache.get(btn.user.id);
      if (!member || btn.user.bot) {
        await btn.reply({ content: "Боты не играют!", ephemeral: true });
        return;
      }

      if (joinedIds.has(btn.user.id)) {
        await btn.reply({ content: "Ты уже в игре!", ephemeral: true });
        return;
      }

      joinedIds.set(btn.user.id, member);
      await btn.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2C2F33)
            .setTitle("🎭 Мафия — набор игроков")
            .setDescription(
              `Нажми **Играю!** чтобы вступить.\n` +
              `Нужно минимум **4 игрока**.\n\n` +
              `**Игроки (${joinedIds.size}):**\n` +
              [...joinedIds.values()].map((m) => `• ${m.displayName}`).join("\n")
            ),
        ],
        components: [row],
      });
    } else if (btn.customId === "mafia_start") {
      if (btn.user.id !== interaction.user.id) {
        await btn.reply({ content: "Только организатор может начать игру!", ephemeral: true });
        return;
      }
      if (joinedIds.size < 4) {
        await btn.reply({ content: `Нужно минимум 4 игрока! Сейчас: ${joinedIds.size}`, ephemeral: true });
        return;
      }
      joinCollector.stop("start");
    }
  });

  joinCollector.on("end", async (_, reason) => {
    if (reason !== "start") {
      unregisterGame(interaction.channelId);
      await interaction.editReply({ components: [] }).catch(() => {});
      if (reason === "time") {
        await channel.send("⏰ Набор игроков завершён — недостаточно участников.");
      }
      return;
    }

    // ── Game start ────────────────────────────────────────────────────────────

    const players = assignRoles([...joinedIds.values()]);
    await interaction.editReply({ components: [] });

    await sendRolesViaDM(players);

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2C2F33)
          .setTitle("🌆 Игра началась!")
          .setDescription(
            `**Игроки (${players.length}):**\n` +
            players.map((p) => `• ${p.member.displayName}`).join("\n") +
            "\n\nРоли отправлены в личные сообщения. Начинается **День 1**!"
          ),
      ],
    });

    // ── Game loop ─────────────────────────────────────────────────────────────

    let day = 1;
    let gameOver = false;

    const checkWin = (): "мафия" | "мирные" | null => {
      const alive = players.filter((p) => p.alive);
      const mafiaCount = alive.filter((p) => p.role === "мафия").length;
      const civilCount = alive.filter((p) => p.role !== "мафия").length;
      if (mafiaCount === 0) return "мирные";
      if (mafiaCount >= civilCount) return "мафия";
      return null;
    };

    const narrate = async (event: string): Promise<string> => {
      try {
        return await geminiText(
          `Ты нарратор игры Мафия. ${event}\nНапиши драматичное и смешное описание происходящего. 2-3 предложения. Пиши на русском.`
        );
      } catch {
        return event;
      }
    };

    while (!gameOver && day <= 15) {
      const alivePlayers = players.filter((p) => p.alive);
      const aliveMafia = alivePlayers.filter((p) => p.role === "мафия");
      const aliveCivilians = alivePlayers.filter((p) => p.role !== "мафия");

      // ── DAY PHASE: vote to eliminate ───────────────────────────────────────

      const dayNarration = await narrate(
        `День ${day} начался. Живые игроки: ${alivePlayers.map((p) => p.member.displayName).join(", ")}.`
      );

      const voteOptions = alivePlayers.map((p, i) =>
        new ButtonBuilder()
          .setCustomId(`vote_${p.member.id}`)
          .setLabel(p.member.displayName.substring(0, 20))
          .setStyle(ButtonStyle.Secondary)
      );

      const voteRows: ActionRowBuilder<ButtonBuilder>[] = [];
      for (let i = 0; i < voteOptions.length; i += 5) {
        voteRows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(voteOptions.slice(i, i + 5)));
      }

      const dayMsg = await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xF1C40F)
            .setTitle(`☀️ День ${day} — Голосование`)
            .setDescription(
              `${dayNarration}\n\n` +
              `**Кого исключить?** Голосование 60 секунд!\n\n` +
              `**Живые (${alivePlayers.length}):**\n` +
              alivePlayers.map((p) => `• ${p.member.displayName}`).join("\n")
            )
            .setFooter({ text: "Каждый голосует один раз" }),
        ],
        components: voteRows.length > 0 ? voteRows : undefined,
      });

      const dayVotes = new Map<string, string>(); // voter -> target

      const dayCollector = dayMsg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 60_000,
        filter: (i) => alivePlayers.some((p) => p.member.id === i.user.id),
      });

      await new Promise<void>((resolve) => {
        dayCollector.on("collect", async (btn) => {
          if (dayVotes.has(btn.user.id)) {
            await btn.reply({ content: "Ты уже проголосовал!", ephemeral: true });
            return;
          }
          const targetId = btn.customId.replace("vote_", "");
          dayVotes.set(btn.user.id, targetId);
          await btn.reply({ content: `✅ Твой голос принят!`, ephemeral: true });
          if (dayVotes.size >= alivePlayers.length) dayCollector.stop("all_voted");
        });
        dayCollector.on("end", () => resolve());
      });

      await dayMsg.edit({ components: [] });

      // Count day votes
      const voteCount = new Map<string, number>();
      dayVotes.forEach((targetId) => voteCount.set(targetId, (voteCount.get(targetId) ?? 0) + 1));

      let eliminatedDay: Player | null = null;
      if (voteCount.size > 0) {
        const maxVotes = Math.max(...voteCount.values());
        const topIds = [...voteCount.entries()].filter(([, v]) => v === maxVotes).map(([id]) => id);
        const eliminatedId = topIds[Math.floor(Math.random() * topIds.length)];
        eliminatedDay = players.find((p) => p.member.id === eliminatedId) ?? null;
        if (eliminatedDay) eliminatedDay.alive = false;
      }

      if (eliminatedDay) {
        const elimNarration = await narrate(
          `Игрок ${eliminatedDay.member.displayName} был исключён голосованием. Его роль: ${eliminatedDay.role}.`
        );
        await channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0xED4245)
              .setTitle(`🗳️ Исключён: ${eliminatedDay.member.displayName}`)
              .setDescription(`${elimNarration}\n\n**Роль:** ${roleEmoji(eliminatedDay.role)} ${eliminatedDay.role}`)
          ],
        });
      } else {
        await channel.send("🤷 Голосование не выявило победителя — никто не исключён.");
      }

      const dayWin = checkWin();
      if (dayWin) { gameOver = true; await endGame(channel, players, dayWin); break; }

      // ── NIGHT PHASE ────────────────────────────────────────────────────────

      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x2C2F33)
            .setTitle(`🌙 Ночь ${day}`)
            .setDescription(
              "Город засыпает...\n\n" +
              "🔫 **Мафия:** проголосуйте в ЛС кого убить\n" +
              "💊 **Доктор:** напишите в ЛС кого лечить\n" +
              "🔍 **Шериф:** напишите в ЛС кого проверить\n\n" +
              "⏱️ 30 секунд на ночные действия"
            ),
        ],
      });

      // Mafia picks victim (first alive non-mafia, random)
      await new Promise((r) => setTimeout(r, 30_000));

      const mafiaTarget = aliveCivilians[Math.floor(Math.random() * aliveCivilians.length)];

      // Doctor saves random alive player
      const doctorPlayer = players.find((p) => p.alive && p.role === "доктор");
      const doctorSave = doctorPlayer
        ? players.filter((p) => p.alive)[Math.floor(Math.random() * players.filter((p) => p.alive).length)]
        : null;

      const saved = doctorSave?.member.id === mafiaTarget?.member.id;

      if (mafiaTarget && !saved) {
        mafiaTarget.alive = false;
        const nightNarration = await narrate(
          `Ночью мафия убила ${mafiaTarget.member.displayName}.`
        );
        await channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x2C2F33)
              .setTitle(`🌆 Доброе утро... или нет`)
              .setDescription(`${nightNarration}\n\n☠️ **${mafiaTarget.member.displayName}** был убит ночью.\n**Роль:** ${roleEmoji(mafiaTarget.role)} ${mafiaTarget.role}`)
          ],
        });
      } else if (saved) {
        await channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x57F287)
              .setTitle("🌆 Доброе утро!")
              .setDescription("Этой ночью доктор спас жертву мафии! Все живы.")
          ],
        });
      }

      const nightWin = checkWin();
      if (nightWin) { gameOver = true; await endGame(channel, players, nightWin); break; }

      day++;
    }

    unregisterGame(interaction.channelId);
  });
}

async function endGame(channel: TextChannel, players: Player[], winner: "мафия" | "мирные") {
  const embed = new EmbedBuilder()
    .setColor(winner === "мирные" ? 0x57F287 : 0xED4245)
    .setTitle(winner === "мирные" ? "🎉 Мирные победили!" : "😈 Мафия победила!")
    .setDescription(
      `**Все роли:**\n` +
      players.map((p) => `${p.alive ? "✅" : "☠️"} **${p.member.displayName}** — ${roleEmoji(p.role)} ${p.role}`).join("\n")
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}
