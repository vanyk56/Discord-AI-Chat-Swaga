import {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  EndBehaviorType,
} from "@discordjs/voice";
import { EmbedBuilder, type VoiceBasedChannel, type TextChannel } from "discord.js";
import { openrouterRequest, MODEL_UTILS } from "./ai.js";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface TranscribeSession {
  guildId: string;
  voiceChannelName: string;
  textChannel: TextChannel;
  active: boolean;
}

const sessions = new Map<string, TranscribeSession>();

// ─── WAV BUILDER ──────────────────────────────────────────────────────────────

function buildWav(pcmData: Buffer, sampleRate = 48000, channels = 2, bitsPerSample = 16): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcmData.length, 40);
  return Buffer.concat([header, pcmData]);
}

// ─── TRANSCRIPTION ─────────────────────────────────────────────────────

const MIN_FRAMES = 8; // ~160ms minimum (to avoid transcribing noise)
const MAX_PCM_BYTES = 6 * 1024 * 1024; // 6MB PCM limit

async function transcribeAudio(pcmBuffers: Buffer[]): Promise<string | null> {
  if (pcmBuffers.length < MIN_FRAMES) return null;

  let pcmData = Buffer.concat(pcmBuffers);
  if (pcmData.length > MAX_PCM_BYTES) {
    pcmData = pcmData.slice(-MAX_PCM_BYTES);
  }

  const wav = buildWav(pcmData);
  const base64Audio = wav.toString("base64");

  try {
    const rawText = await openrouterRequest(
      [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Transcribe this audio exactly as spoken. Reply with ONLY the transcription, no commentary, no timestamps, no formatting. If the audio contains no speech or is completely silent/unclear, reply with exactly one word: ТИШИНА",
            },
            {
              type: "input_audio",
              input_audio: { data: base64Audio, format: "wav" },
            },
          ],
        },
      ],
      MODEL_UTILS
    );

    const text = rawText?.trim() ?? null;
    if (!text || text === "ТИШИНА" || text.toLowerCase() === "silence") return null;
    return text;
  } catch (err) {
    console.error("[Transcribe] OpenRouter error:", (err as Error).message);
    return null;
  }
}

// ─── PER-USER AUDIO SUBSCRIPTION ─────────────────────────────────────────────

async function subscribeUser(session: TranscribeSession, userId: string, username: string): Promise<void> {
  const connection = getVoiceConnection(session.guildId);
  if (!connection || !session.active) return;

  const receiver = connection.receiver;
  if (receiver.subscriptions.has(userId)) return; // Already subscribed

  // Dynamic import of opusscript (it uses WASM)
  let OpusScript: any;
  try {
    const mod = await import("opusscript");
    OpusScript = (mod as any).default ?? mod;
  } catch (err) {
    console.error("[Transcribe] Failed to load opusscript:", err);
    return;
  }

  const FRAME_SIZE = 960; // 20ms at 48kHz
  const decoder = new OpusScript(48000, 2, OpusScript.Application?.AUDIO ?? 2048);
  const pcmBuffers: Buffer[] = [];

  const audioStream = receiver.subscribe(userId, {
    end: { behavior: EndBehaviorType.AfterSilence, duration: 1800 },
  });

  console.log(`[Transcribe] 🎙️ Listening to ${username} (${userId})`);

  audioStream.on("data", (chunk: Buffer) => {
    try {
      const decoded: Int16Array = decoder.decode(chunk, FRAME_SIZE);
      pcmBuffers.push(Buffer.from(decoded.buffer));
    } catch {
      // Skip malformed Opus packets
    }
  });

  audioStream.on("end", async () => {
    console.log(`[Transcribe] ✅ ${username} done speaking (${pcmBuffers.length} frames)`);
    try { decoder.delete?.(); } catch {}

    if (!session.active) return;

    const text = await transcribeAudio(pcmBuffers);
    if (!text) return;

    await session.textChannel
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xdc2626)
            .setDescription(`🎙️ **${username}**: ${text}`)
            .setTimestamp(),
        ],
      })
      .catch(() => {});
  });

  audioStream.on("error", (err) => {
    console.error(`[Transcribe] Stream error for ${username}:`, err);
    try { decoder.delete?.(); } catch {}
  });
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────

export async function startTranscription(
  voiceChannel: VoiceBasedChannel,
  textChannel: TextChannel
): Promise<void> {
  const guildId = voiceChannel.guild.id;

  if (sessions.has(guildId)) {
    throw new Error("Транскрипция уже запущена на этом сервере.");
  }

  // Disconnect any existing voice connection
  const existing = getVoiceConnection(guildId);
  if (existing) {
    existing.destroy();
    await new Promise((r) => setTimeout(r, 400));
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false, // MUST be false to receive audio from users
    selfMute: true,
  });

  const session: TranscribeSession = {
    guildId,
    voiceChannelName: voiceChannel.name,
    textChannel,
    active: true,
  };
  sessions.set(guildId, session);

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch {
    connection.destroy();
    sessions.delete(guildId);
    throw new Error("Не удалось подключиться к голосовому каналу.");
  }

  // When a user starts speaking, subscribe to their audio
  connection.receiver.speaking.on("start", async (userId) => {
    if (!session.active) return;

    let username = `Пользователь ${userId.slice(-4)}`;
    try {
      const member = await voiceChannel.guild.members.fetch(userId);
      username = member.displayName;
    } catch {}

    subscribeUser(session, userId, username).catch(console.error);
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    if (sessions.has(guildId)) {
      await stopTranscription(guildId).catch(() => {});
    }
  });

  await textChannel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xdc2626)
        .setTitle("🎙️ Транскрипция запущена")
        .setDescription(
          `Подключился к **${voiceChannel.name}** и начинаю слушать разговор.\nТранскрипции каждого участника будут появляться здесь.`
        )
        .addFields(
          { name: "Голосовой канал", value: `<#${voiceChannel.id}>`, inline: true },
          { name: "Остановить", value: "`/транскрипция стоп`", inline: true }
        )
        .setFooter({
          text: "Powered by Google Gemini AI • Транскрипция появляется после паузы в речи",
        })
        .setTimestamp(),
    ],
  });
}

export async function stopTranscription(guildId: string): Promise<boolean> {
  const session = sessions.get(guildId);
  if (!session) return false;

  session.active = false;
  sessions.delete(guildId);

  const connection = getVoiceConnection(guildId);
  if (connection) connection.destroy();

  await session.textChannel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x6b7280)
          .setTitle("🔴 Транскрипция остановлена")
          .setDescription(`Покинул **${session.voiceChannelName}**. Запись завершена.`)
          .setTimestamp(),
      ],
    })
    .catch(() => {});

  return true;
}

export function isTranscribing(guildId: string): boolean {
  return sessions.has(guildId);
}
