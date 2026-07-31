// ─── OPENROUTER API INTEGRATION ───────────────────────────────────────────────

const apiKey = process.env.OPENROUTER_API_KEY ?? process.env.AI_INTEGRATIONS_GEMINI_API_KEY ?? process.env.GEMINI_API_KEY;
const baseUrl = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";

if (!apiKey) {
  console.warn("[OpenRouter] API key is missing! Set OPENROUTER_API_KEY environment variable.");
}

// Model designations as requested:
export const MODEL_CHAT = "qwen/qwen3.7-flash";
export const MODEL_UTILS = "qwen/qwen3.7-flash";
export const MODEL_IMAGE = "krea/krea-2-large";
export const MODEL_SKALA = "cognitivecomputations/dolphin-mistral-24b-venice-edition";

export const FALLBACK_MODEL = "google/gemini-2.5-flash";

export interface OpenRouterMessage {
  role: "user" | "assistant" | "system";
  content: string | Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
    | { type: "input_audio"; input_audio: { data: string; format: string } }
  >;
}

/**
 * Send request to OpenRouter Chat Completions API with automatic fallback
 */
export async function openrouterRequest(
  messages: OpenRouterMessage[],
  model: string = MODEL_UTILS,
  options: {
    systemInstruction?: string;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: { type: string };
  } = {}
): Promise<string> {
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is not set!");
  }

  const finalMessages: OpenRouterMessage[] = [];

  if (options.systemInstruction) {
    finalMessages.push({ role: "system", content: options.systemInstruction });
  }
  finalMessages.push(...messages);

  const payload: Record<string, unknown> = {
    model,
    messages: finalMessages,
    max_tokens: options.maxTokens ?? 4096,
  };

  if (options.temperature !== undefined) payload.temperature = options.temperature;
  if (options.responseFormat) payload.response_format = options.responseFormat;

  let response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://discord.com",
      "X-Title": "SWAGAgpt Discord Bot",
    },
    body: JSON.stringify(payload),
  });

  // Automatic fallback if requested model is unavailable (404/400)
  if (!response.ok && model !== FALLBACK_MODEL) {
    const errBody = await response.text();
    if (response.status === 404 || errBody.includes("Batch API") || errBody.includes("not found")) {
      console.warn(`[OpenRouter] Model ${model} unavailable for live chat (${response.status}), falling back to ${FALLBACK_MODEL}`);
      payload.model = FALLBACK_MODEL;
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://discord.com",
          "X-Title": "SWAGAgpt Discord Bot",
        },
        body: JSON.stringify(payload),
      });
    } else {
      throw new Error(`OpenRouter API error (${response.status}): ${errBody.slice(0, 300)}`);
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorText.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return data.choices?.[0]?.message?.content ?? "";
}

/**
 * Primary text generation for utilities (uses openai/gpt-5.6-terra-pro with fallback)
 */
export async function geminiText(
  prompt: string,
  systemInstruction?: string,
  model: string = MODEL_UTILS
): Promise<string> {
  return openrouterRequest([{ role: "user", content: prompt }], model, { systemInstruction });
}

/**
 * JSON response helper for utilities and games
 */
export async function geminiJSON<T>(prompt: string, model: string = MODEL_UTILS): Promise<T> {
  const raw = await geminiText(
    prompt + "\n\nОтветь ТОЛЬКО валидным JSON без markdown блоков и лишнего текста.",
    undefined,
    model
  );
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  return JSON.parse(cleaned) as T;
}

/**
 * Multi-turn chat generation for main chat
 */
export async function openrouterChat(
  messages: OpenRouterMessage[],
  systemInstruction?: string,
  model: string = MODEL_CHAT
): Promise<string> {
  return openrouterRequest(messages, model, { systemInstruction });
}

/**
 * Extract image URL or Base64 from model text response or choices
 */
async function fetchImageFromResponse(
  content: string,
  rawChoices?: any[]
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  if (rawChoices && Array.isArray(rawChoices)) {
    for (const choice of rawChoices) {
      if (choice.message?.images && Array.isArray(choice.message.images)) {
        for (const img of choice.message.images) {
          const url = typeof img === "string" ? img : img.url;
          if (url) return fetchImageFromUrl(url);
        }
      }
    }
  }

  const urlMatch = content.match(/https?:\/\/[^\s\)\"]+\.(?:png|jpg|jpeg|webp|gif)/i) ??
                   content.match(/https?:\/\/[^\s\)\"]+/i);

  if (urlMatch) {
    const fetched = await fetchImageFromUrl(urlMatch[0]);
    if (fetched) return fetched;
  }

  const dataUriMatch = content.match(/data:(image\/[a-zA-Z+]+);base64,([A-Za-z0-9+/=]+)/);
  if (dataUriMatch) {
    return {
      mimeType: dataUriMatch[1]!,
      buffer: Buffer.from(dataUriMatch[2]!, "base64"),
    };
  }

  return null;
}

async function fetchImageFromUrl(url: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") ?? "image/png";
    return {
      buffer: Buffer.from(arrayBuf),
      mimeType: contentType.split(";")[0]!,
    };
  } catch (err) {
    console.error("[OpenRouter] Failed to fetch image URL:", err);
    return null;
  }
}

/**
 * Image generation using krea/krea-2-large
 */
export async function geminiGenerateImage(
  prompt: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
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
        model: MODEL_IMAGE,
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as any;
      const content = data.choices?.[0]?.message?.content ?? "";
      const parsed = await fetchImageFromResponse(content, data.choices);
      if (parsed) return parsed;
    }

    const imgResponse = await fetch(`${baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_IMAGE,
        prompt: prompt,
        n: 1,
      }),
    });

    if (imgResponse.ok) {
      const imgData = (await imgResponse.json()) as { data?: Array<{ url?: string; b64_json?: string }> };
      const item = imgData.data?.[0];
      if (item?.url) {
        return fetchImageFromUrl(item.url);
      } else if (item?.b64_json) {
        return {
          buffer: Buffer.from(item.b64_json, "base64"),
          mimeType: "image/png",
        };
      }
    }

    return null;
  } catch (error) {
    console.error("[OpenRouter] Image generation error:", error);
    return null;
  }
}

/**
 * Image editing using krea/krea-2-large
 */
export async function geminiEditImage(
  imageData: string,
  imageMimeType: string,
  prompt: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const dataUrl = `data:${imageMimeType};base64,${imageData}`;
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://discord.com",
        "X-Title": "SWAGAgpt Discord Bot",
      },
      body: JSON.stringify({
        model: MODEL_IMAGE,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as any;
    const content = data.choices?.[0]?.message?.content ?? "";
    return fetchImageFromResponse(content, data.choices);
  } catch (error) {
    console.error("[OpenRouter] Image editing error:", error);
    return null;
  }
}

export const ai = {
  models: {
    generateContent: async (args: any) => {
      const prompt = typeof args.contents === "string"
        ? args.contents
        : JSON.stringify(args.contents);
      const text = await geminiText(prompt, args.config?.systemInstruction);
      return { text };
    },
  },
};

export type Part = any;
