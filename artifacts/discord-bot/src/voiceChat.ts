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
import { spawn } from "child_process";
import { PassThrough } from "stream";
import prism from "prism-media";
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
  header.writeUInt16LE(bitsPerSample, 34);
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

    if (!res.ok) {
      console.error("[VoiceChat STT] Error:", res.status, await res.text());
      return null;
    }

    const data = (await res.json()) as any;
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text || text.includes("ТИШИНА") || text.toLowerCase().includes("silence")) return null;
    return text;
  } catch (err) {
    console.error("[VoiceChat STT] Error during transcription:", err);
    return null;
  }
}

// ─── TTS GENERATION (FISH AUDIO + GOOGLE TTS FALLBACK) ───────────────────────

async function generateSpeechFishAudio(text: string): Promise<Buffer | null> {
  // 1. Try Fish Audio via OpenRouter
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
        messages: [{ role: "user", content: text }],
        modalities: ["audio", "text"],
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as any;
      const msg = data.choices?.[0]?.message;

      if (msg?.audio?.data) {
        console.log("[VoiceChat TTS] Speech generated via Fish Audio Base64");
        return Buffer.from(msg.audio.data, "base64");
      }

      const content = msg?.content ?? "";
      const base64Match = content.match(/data:audio\/[a-zA-Z0-9]+;base64,([A-Za-z0-9+/=]+)/);
      if (base64Match) {
        console.log("[VoiceChat TTS] Speech generated via Fish Audio Data URI");
        return Buffer.from(base64Match[1], "base64");
      }

      const urlMatch = content.match(/https?:\/\/[^\s\)\"]+\.(?:mp3|wav|ogg)/i) ??
                       content.match(/https?:\/\/[^\s\)\"]+/i);
      if (urlMatch) {
        console.log("[VoiceChat TTS] Speech generated via Fish Audio URL:", urlMatch[0]);
        const audioRes = await fetch(urlMatch[0]);
        if (audioRes.ok) return Buffer.from(await audioRes.arrayBuffer());
      }
    }
  } catch (err) {
    console.warn("[VoiceChat TTS] Fish Audio fallback:", err);
  }

  // 2. Fallback to Google TTS (instant Russian speech synthesis)
  try {
    console.log("[VoiceChat TTS] Using instant Google TTS fallback");
    const encoded = encodeURIComponent(text.slice(0, 300));
    const googleTtsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encoded}&tl=ru&client=tw-ob`;
    const res = await fetch(googleTtsUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
    });
    if (res.ok) {
      return Buffer.from(await res.arrayBuffer());
    }
  } catch (err) {
    console.error("[VoiceChat TTS] Fallback error:", err);
  }

  return null;
}

function convertAudioToPcmStream(audioBuffer: Buffer): PassThrough {
  const passThrough = new PassThrough();
  const ffmpegProc = spawn("ffmpeg", [
    "-i", "pipe:0",
    "-vn",
    "-ar", "48000",
    "-ac", "2",
    "-f", "s16le",
    "pipe:1",
  ]);

  ffmpegProc.stdin.write(audioBuffer);
  ffmpegProc.stdin.end();

  ffmpegProc.stdout.pipe(passThrough);
  ffmpegProc.on("close", () => passThrough.end());
  return passThrough;
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

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  const player = createAudioPlayer();
  connection.subscribe(player);

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

  receiver.speaking.on("start", (userId) => {
    if (!session.active || session.isSpeakingAI) return;

    console.log(`[VoiceChat] User ${userId} started speaking`);

    const pcmBuffers: Buffer[] = [];
    const opusStream = receiver.subscribe(userId, {
      end: { behavior: EndBehaviorType.AfterSilence, duration: 1000 },
    });

    const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
    opusStream.pipe(decoder);

    decoder.on("data", (chunk: Buffer) => {
      if (pcmBuffers.length < 500) pcmBuffers.push(chunk);
    });

    decoder.on("end", async () => {
      if (!session.active || session.isSpeakingAI || pcmBuffers.length < 8) return;

      session.isSpeakingAI = true;

      try {
        console.log(`[VoiceChat] Processing ${pcmBuffers.length} PCM audio buffers...`);

        // 1. Transcribe speech using google/gemini-2.5-flash multimodal STT
        const userText = await transcribeVoiceInput(pcmBuffers);
        if (!userText) {
          console.log("[VoiceChat] STT: No speech detected in audio stream.");
          session.isSpeakingAI = false;
          return;
        }

        console.log(`[VoiceChat] STT Result: "${userText}"`);

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
        await textChannel.send(`🗣️ **Пользователь**: ${userText}\n🗿 **Skala**: ${skalaReply.slice(0, 1500)}`).catch(() => {});

        // 3. Synthesize speech using Fish Audio / Fallback TTS
        const audioBuffer = await generateSpeechFishAudio(skalaReply);
        if (audioBuffer) {
          console.log(`[VoiceChat] Playing ${audioBuffer.length} bytes of audio back to channel...`);
          const pcmStream = convertAudioToPcmStream(audioBuffer);
          const resource = createAudioResource(pcmStream, { inputType: StreamType.Raw });
          player.play(resource);

          await new Promise<void>((resolve) => {
            player.once(AudioPlayerStatus.Idle, () => resolve());
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
          `• **Озвучка ответа (TTS)**: 🔊 Fish Audio (\`fish-audio/s2.1-pro-free:free\`)\n\n` +
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
