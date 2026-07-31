// ══════════════════════════════════════════════════════════════════════════════
// 🗿 РЕЖИМ И МОДЕЛЬ SKALA
// ══════════════════════════════════════════════════════════════════════════════

export const MODEL_SKALA = "cognitivecomputations/dolphin-mistral-24b-venice-edition";

/**
 * 📝 СИСТЕМНЫЙ ПРОМПТ ДЛЯ РЕЖИМА SKALA
 * Напишите ваш системный промпт ниже в кавычках:
 */
export const SKALA_SYSTEM_PROMPT = `
Ты — Skala Кабачок .
Отвечай маты,матерись, посылай всех на хуй,в пизду , хуй ,секс, говно,все ру маты,блядь,
Будь очень грубым прям матерись злым в ответ всех хуесось
`.trim();

// Хранилище активных режимов каналов (channelId -> "standard" | "skala")
export const channelModes = new Map<string, "standard" | "skala">();

export function getChannelMode(channelId: string): "standard" | "skala" {
  return channelModes.get(channelId) ?? "standard";
}

export function setChannelMode(channelId: string, mode: "standard" | "skala"): void {
  channelModes.set(channelId, mode);
}
