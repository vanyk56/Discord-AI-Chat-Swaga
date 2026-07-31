import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  StreamType,
  EndBehaviorType,
} from "@discordjs/voice";
import { EmbedBuilder, type VoiceBasedChannel, type TextChannel } from "discord.js";
import { Readable } from "stream";
import { openrouterChat, MODEL_SKALA } from "./ai.js";
import { SKALA_SYSTEM_PROMPT } from "./skala.js";

const apiKey = process.env.OPENROUTER_API_KEY ?? process.env.AI_INTEGRATIONS_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY;
const baseUrl = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";

export const MODEL_STT = "google/gemini-2.5-flash";
export const MODEL_TTS = "fish-audio/s2.1-pro-free:free";

interface VoiceChatSession {
  guildId: string;
  voiceChannel: VoiceBasedChannel;
  textChannel: TextChannel;
  active: boolean;
  player: ReturnType<typeof createAudioPlayer>;
  isSpeakingAI: boolean;
}

const sessions = new Map<string, VoiceChatSession>();

// ─── WAV BUILDER ─────────────────────────────────────────────────────────────

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
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcmData.length, 40);
  return Buffer.concat([header, pcmData]);
}

async function transcribeVoiceInput(pcmBuffers: Buffer[]): Promise<string | null> {
  if (pcmBuffers.length < 8) return null;
  let pcmData = Buffer.concat(pcmBuffers);
  if (pcmData.length > 6 * 1024 * 1024) pcmData = pcmData.slice(-6 * 1024 * 1024);
  const wav = buildWav(pcmData);
  const base64Audio = wav.toString("base64");

  // Attempt 1: input_audio payload
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://discord.com",
        "X-Title": "SWAGAgpt Discord Bot",
      },
      body: JSON.stringify({
        model: MODEL_STT,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Transcribe spoken audio in Russian. Return ONLY the spoken text. If silent or no speech, reply with exactly: ТИШИНА" },
              { type: "input_audio", input_audio: { data: base64Audio, format: "wav" } },
            ],
          },
        ],
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as any;
      const text = data.choices?.[0]?.message?.content?.trim();
      if (text && !text.includes("ТИШИНА") && !text.toLowerCase().includes("silence")) {
        return text;
      }
    }
  } catch {}

  // Attempt 2: image_url Data URI fallback
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://discord.com",
        "X-Title": "SWAGAgpt Discord Bot",
      },
      body: JSON.stringify({
        model: MODEL_STT,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Transcribe spoken audio in Russian. Return ONLY the spoken text. If silent or no speech, reply with exactly: ТИШИНА" },
              { type: "image_url", image_url: { url: `data:audio/wav;base64,${base64Audio}` } },
            ],
          },
        ],
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as any;
      const text = data.choices?.[0]?.message?.content?.trim();
      if (text && !text.includes("ТИШИНА") && !text.toLowerCase().includes("silence")) {
        return text;
      }
    }
  } catch (err) {
    console.error("[VoiceChat STT] Fallback error:", err);
  }

  return null;
}

// ─── TTS GENERATION ──────────────────────────────────────────────────────────

async function generateSpeechAudio(text: string): Promise<Buffer | null> {
  const cleanText = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<:[a-zA-Z0-9_]+:[0-9]+>/g, "")
    .replace(/[\*\_~`#]/g, "")
    .trim();

  if (!cleanText) return null;

  // 1. Primary: Try Google TTS (instant Russian speech synthesis)
  try {
    const chunks: Buffer[] = [];
    const parts = cleanText.match(/[^.!?]+[.!?]+/g) ?? [cleanText];
    for (const part of parts.slice(0, 4)) {
      const encoded = encodeURIComponent(part.trim().slice(0, 200));
      if (!encoded) continue;
      const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=ru&client=tw-ob`;
      const res = await fetch(googleUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        },
      });
      if (res.ok) {
        chunks.push(Buffer.from(await res.arrayBuffer()));
      }
    }
    if (chunks.length > 0) {
      console.log(`[VoiceChat TTS] Synthesized ${chunks.length} Google TTS chunks.`);
      return Buffer.concat(chunks);
    }
  } catch (err) {
    console.warn("[VoiceChat TTS] Google TTS error, trying Fish Audio fallback:", err);
  }

  // 2. Fallback: Try Fish Audio via OpenRouter
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://discord.com",
        "X-Title": "SWAGAgpt Discord Bot",
      },
      body: JSON.stringify({
        model: MODEL_TTS,
        messages: [{ role: "user", content: cleanText.slice(0, 300) }],
        modalities: ["audio", "text"],
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as any;
      const msg = data.choices?.[0]?.message;

      if (msg?.audio?.data) return Buffer.from(msg.audio.data, "base64");

      const content = msg?.content ?? "";
      const base64Match = content.match(/data:audio\/[a-zA-Z0-9]+;base64,([A-Za-z0-9+/=]+)/);
      if (base64Match) return Buffer.from(base64Match[1], "base64");

      const urlMatch = content.match(/https?:\/\/[^\s\)\"]+\.(?:mp3|wav|ogg)/i) ??
                       content.match(/https?:\/\/[^\s\)\"]+/i);
      if (urlMatch) {
        const audioRes = await fetch(urlMatch[0]);
        if (audioRes.ok) return Buffer.from(await audioRes.arrayBuffer());
      }
    }
  } catch (err) {
    console.error("[VoiceChat TTS] Fish Audio error:", err);
  }

  return null;
}

// ─── VOICE CHAT MANAGER ──────────────────────────────────────────────────────

export function isVoiceChatActive(guildId: string): boolean {
  return sessions.has(guildId);
}

export async function startVoiceChat(
  voiceChannel: VoiceBasedChannel,
  textChannel: TextChannel
): Promise<void> {
  const guildId = voiceChannel.guild.id;

  if (sessions.has(guildId)) {
    stopVoiceChat(guildId);
  }

  // Destroy existing voice connection first to release adapter
  const existing = getVoiceConnection(guildId);
  if (existing) {
    existing.destroy();
    await new Promise((r) => setTimeout(r, 400));
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  const player = createAudioPlayer();
  connection.subscribe(player);

  player.on("error", (error) => {
    console.error("[VoiceChat Player] Error:", error.message, error.resource?.metadata);
  });

  player.on(AudioPlayerStatus.Playing, () => {
    console.log("[VoiceChat Player] Audio started playing in voice channel!");
  });

  player.on(AudioPlayerStatus.Idle, () => {
    console.log("[VoiceChat Player] Audio playback completed.");
  });

  const session: VoiceChatSession = {
    guildId,
    voiceChannel,
    textChannel,
    active: true,
    player,
    isSpeakingAI: false,
  };

  sessions.set(guildId, session);

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch (err) {
    stopVoiceChat(guildId);
    throw new Error("Не удалось подключиться к голосовому каналу.");
  }

  const receiver = connection.receiver;

  receiver.speaking.on("start", async (userId) => {
    if (!session.active || session.isSpeakingAI) return;

    let username = `Пользователь ${userId.slice(-4)}`;
    try {
      const member = await voiceChannel.guild.members.fetch(userId);
      username = member.displayName;
    } catch {}

    let OpusScript: any;
    try {
      const mod = await import("opusscript");
      OpusScript = (mod as any).default ?? mod;
    } catch (err) {
      console.error("[VoiceChat] Failed to load opusscript:", err);
      return;
    }

    const FRAME_SIZE = 960; // 20ms at 48kHz
    const decoder = new OpusScript(48000, 2, OpusScript.Application?.AUDIO ?? 2048);
    const pcmBuffers: Buffer[] = [];

    const audioStream = receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: 800 },
    });

    console.log(`[VoiceChat] 🎙️ Listening to ${username} (${userId})`);

    audioStream.on("data", (chunk: Buffer) => {
      try {
        const decoded: Int16Array = decoder.decode(chunk, FRAME_SIZE);
        pcmBuffers.push(Buffer.from(decoded.buffer));
      } catch {
        // Skip malformed packets
      }
    });

    audioStream.on("end", async () => {
      try { decoder.delete?.(); } catch {}

      if (!session.active || session.isSpeakingAI || pcmBuffers.length < 8) return;

      session.isSpeakingAI = true;

      try {
        console.log(`[VoiceChat] Processing ${pcmBuffers.length} decoded PCM frames from ${username}...`);

        // 1. Transcribe speech using google/gemini-2.5-flash
        const userText = await transcribeVoiceInput(pcmBuffers);
        if (!userText) {
          console.log(`[VoiceChat] STT: No speech detected from ${username}.`);
          session.isSpeakingAI = false;
          return;
        }

        console.log(`[VoiceChat] STT Result (${username}): "${userText}"`);

        // 2. Generate response text with Skala model (Dolphin Mistral 24B Venice Edition)
        const skalaReply = await openrouterChat(
          [{ role: "user", content: userText }],
          SKALA_SYSTEM_PROMPT,
          MODEL_SKALA
        );

        if (!skalaReply) {
          console.log("[VoiceChat] Skala model returned empty reply.");
          session.isSpeakingAI = false;
          return;
        }

        console.log(`[VoiceChat] Skala reply: "${skalaReply}"`);

        // Send text copy to text channel
        await textChannel.send(`🗣️ **${username}**: ${userText}\n🗿 **Skala**: ${skalaReply.slice(0, 1500)}`).catch(() => {});

        // 3. Synthesize speech using TTS and play back into voice channel
        const audioBuffer = await generateSpeechAudio(skalaReply);
        if (audioBuffer && audioBuffer.length > 0) {
          console.log(`[VoiceChat] Playing ${audioBuffer.length} bytes of audio back to channel...`);
          const audioStream = Readable.from(audioBuffer);
          const resource = createAudioResource(audioStream, {
            inputType: StreamType.Arbitrary,
          });

          player.play(resource);

          await new Promise<void>((resolve) => {
            const onIdle = () => {
              player.off(AudioPlayerStatus.Idle, onIdle);
              player.off("error", onError);
              resolve();
            };
            const onError = () => {
              player.off(AudioPlayerStatus.Idle, onIdle);
              player.off("error", onError);
              resolve();
            };
            player.once(AudioPlayerStatus.Idle, onIdle);
            player.once("error", onError);
            setTimeout(resolve, 30_000);
          });
        } else {
          console.error("[VoiceChat] Failed to synthesize audio speech.");
        }
      } catch (err) {
        console.error("[VoiceChat] Error in conversation loop:", err);
      } finally {
        session.isSpeakingAI = false;
      }
    });
  });

  await textChannel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle("🎙️ Живой голосовой диалог активирован!")
        .setDescription(
          `Бот зашёл в канал <#${voiceChannel.id}>.\n\n` +
          `• **Распознавание речи (STT)**: 👂 Gemini 2.5 Flash (\`google/gemini-2.5-flash\`)\n` +
          `• **Генерация ответа ИИ**: 🗿 Skala (\`cognitivecomputations/dolphin-mistral-24b-venice-edition\`)\n` +
          `• **Озвучка ответа (TTS)**: 🔊 Включена озвучка в голосовой канал\n\n` +
          `Просто говорите в голосовом канале — Skala выслушает вас и ответит голосом в реальном времени!`
        )
        .setFooter({ text: "Используй /voice-chat стоп чтобы выключить" }),
    ],
  });
}

export function stopVoiceChat(guildId: string): boolean {
  const session = sessions.get(guildId);
  if (!session) return false;

  session.active = false;
  session.player.stop(true);

  const conn = getVoiceConnection(guildId);
  if (conn) conn.destroy();

  sessions.delete(guildId);
  return true;
}
