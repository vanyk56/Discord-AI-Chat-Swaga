import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  StreamType,
  NoSubscriberBehavior,
} from "@discordjs/voice";
import { spawn } from "child_process";
import { PassThrough } from "stream";
import type { VoiceBasedChannel, TextBasedChannel } from "discord.js";
import ytdl from "@distube/ytdl-core";

async function initSodium() {
  try {
    const sodium = await import("libsodium-wrappers");
    await sodium.default.ready;
    console.log("[Voice] libsodium-wrappers ready");
    return true;
  } catch {
    console.warn("[Voice] libsodium-wrappers failed, trying tweetnacl");
    return false;
  }
}

const sodiumReady = initSodium();

const activePlayer = createAudioPlayer({
  behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
});

let activeConnectionGuildId: string | null = null;

activePlayer.on("error", (error) => {
  console.error("[Voice] Audio player error:", error.message, error.resource?.metadata);
});

export function getActiveGuildId() {
  return activeConnectionGuildId;
}

async function getYoutubeInfo(url: string): Promise<{ title: string; duration: string } | null> {
  try {
    const info = await ytdl.getInfo(url);
    const secs = parseInt(info.videoDetails.lengthSeconds, 10);
    const mins = Math.floor(secs / 60);
    const s = String(secs % 60).padStart(2, "0");
    return {
      title: info.videoDetails.title,
      duration: `${mins}:${s}`,
    };
  } catch (err) {
    console.error("[Voice] ytdl getInfo error:", (err as Error).message?.slice(0, 300));
    return null;
  }
}

function streamYouTube(url: string): PassThrough {
  const passThrough = new PassThrough();

  const ytStream = ytdl(url, { filter: "audioonly", quality: "highestaudio" });

  const ffmpegProc = spawn("ffmpeg", [
    "-i", "pipe:0",
    "-vn",
    "-ar", "48000",
    "-ac", "2",
    "-f", "s16le",
    "pipe:1",
  ]);

  ytStream.pipe(ffmpegProc.stdin);
  ytStream.on("error", (err) => {
    console.error("[Voice] ytdl stream error:", err.message);
    passThrough.end();
  });

  ffmpegProc.stdout.pipe(passThrough);
  ffmpegProc.stderr.on("data", (d: Buffer) =>
    console.error("[ffmpeg]", d.toString().slice(0, 200))
  );
  ffmpegProc.on("close", (code) => {
    if (code !== 0) console.error("[ffmpeg] exited with code", code);
    passThrough.end();
  });

  return passThrough;
}

function streamDirectUrl(audioUrl: string): PassThrough {
  const passThrough = new PassThrough();

  const ffmpegProc = spawn("ffmpeg", [
    "-reconnect", "1",
    "-reconnect_streamed", "1",
    "-reconnect_delay_max", "5",
    "-i", audioUrl,
    "-vn",
    "-ar", "48000",
    "-ac", "2",
    "-f", "s16le",
    "pipe:1",
  ]);

  ffmpegProc.stdout.pipe(passThrough);
  ffmpegProc.stderr.on("data", (d: Buffer) =>
    console.error("[ffmpeg]", d.toString().slice(0, 200))
  );
  ffmpegProc.on("close", (code) => {
    if (code !== 0) console.error("[ffmpeg] exited with code", code);
    passThrough.end();
  });

  return passThrough;
}

async function sendText(textChannel: TextBasedChannel, msg: string) {
  if ("send" in textChannel) {
    await (textChannel as { send: (m: string) => Promise<unknown> }).send(msg);
  }
}

export async function startBroadcast(
  voiceChannel: VoiceBasedChannel,
  textChannel: TextBasedChannel,
  url: string
): Promise<void> {
  await sodiumReady;

  const guildId = voiceChannel.guild.id;

  const existing = getVoiceConnection(guildId);
  if (existing) {
    existing.destroy();
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`[Voice] Joining channel ${voiceChannel.name} (${voiceChannel.id}) in guild ${guildId}`);

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  activeConnectionGuildId = guildId;

  connection.on(VoiceConnectionStatus.Connecting, () => console.log("[Voice] Connecting..."));
  connection.on(VoiceConnectionStatus.Ready, () => console.log("[Voice] Ready!"));
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    console.warn("[Voice] Disconnected — attempting reconnect");
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      connection.destroy();
      activeConnectionGuildId = null;
    }
  });
  connection.on("error", (err) => console.error("[Voice] Connection error:", err));

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
  } catch (err) {
    console.error("[Voice] Failed to reach Ready state:", err);
    connection.destroy();
    activeConnectionGuildId = null;
    await sendText(textChannel,
      err instanceof Error
        ? `❌ Ошибка подключения к голосовому каналу: \`${err.message}\``
        : "❌ Не удалось подключиться к голосовому каналу. Проверь права бота (Connect + Speak)."
    );
    return;
  }

  const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");

  if (isYouTube) {
    await sendText(textChannel, "🔍 Получаю информацию о видео...");
    console.log("[Voice] Using ytdl for:", url);

    const info = await getYoutubeInfo(url);

    if (!info) {
      await sendText(textChannel,
        "❌ Не удалось получить информацию о видео. Оно может быть приватным, возрастным или недоступным."
      );
      stopBroadcast(guildId);
      return;
    }

    await sendText(textChannel,
      `🎬 Запускаю: **${info.title}** \`[${info.duration}]\`\n🔊 Воспроизвожу аудио в <#${voiceChannel.id}>`
    );

    const passThrough = streamYouTube(url);
    const resource = createAudioResource(passThrough, { inputType: StreamType.Raw });

    connection.subscribe(activePlayer);
    activePlayer.play(resource);
  } else {
    await sendText(textChannel, `🔊 Запускаю прямую трансляцию аудио в <#${voiceChannel.id}>`);

    const passThrough = streamDirectUrl(url);
    const resource = createAudioResource(passThrough, { inputType: StreamType.Raw });

    connection.subscribe(activePlayer);
    activePlayer.play(resource);
  }

  activePlayer.once(AudioPlayerStatus.Idle, async () => {
    console.log("[Voice] Playback finished");
    await sendText(textChannel, "✅ Воспроизведение завершено.");
    stopBroadcast(guildId);
  });
}

export function stopBroadcast(guildId: string): void {
  console.log("[Voice] Stopping broadcast for guild", guildId);
  activePlayer.stop(true);
  const connection = getVoiceConnection(guildId);
  if (connection) {
    connection.destroy();
  }
  if (activeConnectionGuildId === guildId) {
    activeConnectionGuildId = null;
  }
}
