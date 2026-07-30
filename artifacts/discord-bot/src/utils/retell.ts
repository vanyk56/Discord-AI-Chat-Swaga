import { ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { openrouterRequest, MODEL_UTILS } from "../ai.js";
import https from "https";
import http from "http";
import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { createRequire } from "module";
import { Buffer } from "buffer";
import { extractDjVuPageTexts } from "./djvuExtract.js";

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);

const CONVERT_PATH = "/nix/store/hm5p1jkyrqp2jinklggxv8q7qg1glf03-replit-runtime-path/bin/convert";
const MAGICK_PATH  = "/nix/store/hm5p1jkyrqp2jinklggxv8q7qg1glf03-replit-runtime-path/bin/magick";
const PDFTOPPM_PATH = "/nix/store/hm5p1jkyrqp2jinklggxv8q7qg1glf03-replit-runtime-path/bin/pdftoppm";

const CHUNK_SIZE = 20;
const DJVU_CHUNK_SIZE = 5;
const MAX_PAGES = 100;
const MAX_SINGLE_IMAGE_BYTES = 3 * 1024 * 1024;
const DJVU_MAX_IMAGE_BYTES = 700 * 1024;
const GEMINI_TOTAL_LIMIT_BYTES = 7 * 1024 * 1024;

// ─── File download ────────────────────────────────────────────────────────────

async function downloadBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

// ─── PPM → JPEG ──────────────────────────────────────────────────────────────

async function ppmToJpeg(ppmPath: string, quality = 70): Promise<Buffer> {
  const outPath = ppmPath.replace(/\.ppm$/, ".jpg");
  await execFileAsync(CONVERT_PATH, [ppmPath, "-quality", String(quality), outPath], { timeout: 30000 });
  const buf = fs.readFileSync(outPath);
  try { fs.unlinkSync(outPath); } catch { /* ignore */ }
  return buf;
}

// ─── DjVu: extract text for a range of pages ─────────────────────────────────

function extractDjvuChunkText(allPageTexts: string[], from: number, to: number): string {
  return allPageTexts
    .slice(from - 1, to)
    .filter((t) => t.length > 0)
    .join("\n\n")
    .trim();
}

// ─── DjVu: chunk of pages → images via ImageMagick ──────────────────────────

async function convertDjvuChunkWithMagick(djvuPath: string, from: number, to: number): Promise<Buffer[]> {
  const images: Buffer[] = [];
  let totalBytes = 0;

  for (let p = from; p <= to; p++) {
    if (totalBytes >= GEMINI_TOTAL_LIMIT_BYTES) {
      console.warn(`[retell] DjVu chunk ${from}-${to}: total size limit reached at page ${p}`);
      break;
    }

    const pageIndex = p - 1;
    const outPath = path.join(os.tmpdir(), `djvu_magick_${Date.now()}_${p}.jpg`);

    const tryConvert = async (density: number, quality: number, resize: string): Promise<Buffer | null> => {
      const tmpOut = outPath.replace(".jpg", `_${density}.jpg`);
      try {
        await execFileAsync(
          MAGICK_PATH,
          [`${djvuPath}[${pageIndex}]`, "-density", String(density), "-resize", resize, "-quality", String(quality), tmpOut],
          { timeout: 60000 }
        );
        if (!fs.existsSync(tmpOut)) return null;
        const buf = fs.readFileSync(tmpOut);
        return buf.length > 0 ? buf : null;
      } catch {
        return null;
      } finally {
        try { if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut); } catch { /* ignore */ }
      }
    };

    try {
      let buf: Buffer | null = null;

      for (const [density, quality, resize] of [
        [100, 65, "1000x1400>"] as const,
        [72,  60, "800x1100>"]  as const,
        [72,  55, "700x1000>"]  as const,
      ]) {
        buf = await tryConvert(density, quality, resize);
        if (buf && buf.length <= DJVU_MAX_IMAGE_BYTES) break;
        if (buf && buf.length > DJVU_MAX_IMAGE_BYTES) buf = null;
      }

      if (buf) {
        images.push(buf);
        totalBytes += buf.length;
        console.log(`[retell] DjVu page ${p}: ${(buf.length / 1024).toFixed(0)}KB, total ${(totalBytes / 1024 / 1024).toFixed(1)}MB`);
      } else {
        console.warn(`[retell] DjVu page ${p}: all density attempts failed or too large`);
      }
    } catch (err) {
      console.warn(`[retell] magick DjVu page ${p} error: ${err}`);
    }
  }
  return images;
}

// ─── PDF: chunk of pages → images ────────────────────────────────────────────

async function convertPdfChunk(pdfPath: string, from: number, to: number): Promise<Buffer[]> {
  const prefix = path.join(os.tmpdir(), `pdf_${Date.now()}`);
  try {
    await execFileAsync(
      PDFTOPPM_PATH,
      ["-jpeg", "-r", "200", "-f", String(from), "-l", String(to), pdfPath, prefix],
      { timeout: 120000, maxBuffer: 200 * 1024 * 1024 }
    );
  } catch (err: any) {
    throw new Error(`pdftoppm: ${err?.stderr ?? err?.message ?? err}`);
  }

  const images: Buffer[] = [];
  const base = path.basename(prefix);
  const files = fs.readdirSync(os.tmpdir())
    .filter((f) => f.startsWith(base) && f.endsWith(".jpg"))
    .sort();

  for (const f of files) {
    const fullPath = path.join(os.tmpdir(), f);
    try {
      const buf = fs.readFileSync(fullPath);
      if (buf.length <= MAX_SINGLE_IMAGE_BYTES) images.push(buf);
    } finally { try { fs.unlinkSync(fullPath); } catch { /* ignore */ } }
  }
  return images;
}

// ─── PDF text extraction ──────────────────────────────────────────────────────

async function extractPdfText(buffer: Buffer, from: number, to: number): Promise<string> {
  const pdfParse = require("pdf-parse") as (buf: Buffer, opts?: any) => Promise<any>;
  const pageTexts: string[] = [];
  await pdfParse(buffer, {
    pagerender: async (pageData: any) => {
      try {
        const content = await pageData.getTextContent();
        const text = (content.items as any[]).map((i: any) => i.str ?? "").join(" ").replace(/\s+/g, " ").trim();
        pageTexts.push(text);
      } catch { pageTexts.push(""); }
      return "";
    },
  });
  return pageTexts.slice(from - 1, to).join("\n\n").trim();
}

// ─── EPUB text extraction ─────────────────────────────────────────────────────

async function extractEpubChapters(buffer: Buffer): Promise<string[]> {
  const EPub = require("epub2") as any;
  const tmpFile = path.join(os.tmpdir(), `retell_${Date.now()}.epub`);
  fs.writeFileSync(tmpFile, buffer);

  return new Promise((resolve, reject) => {
    const EpubClass = EPub.default ?? EPub;
    const epub = new EpubClass(tmpFile);
    epub.on("end", async () => {
      const chapters: string[] = [];
      for (const item of (epub.flow ?? []) as any[]) {
        try {
          const text = await new Promise<string>((res, rej) => {
            epub.getChapter(item.id, (err: any, data: string) => {
              if (err) return rej(err);
              res(data.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim());
            });
          });
          if (text.length > 50) chapters.push(text);
        } catch { chapters.push(""); }
      }
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
      resolve(chapters);
    });
    epub.on("error", (err: any) => {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
      reject(err);
    });
    epub.parse();
  });
}

// ─── Gemini: retell chunk from images ────────────────────────────────────────

async function geminiChunkFromImages(
  images: Buffer[],
  fromPage: number,
  toPage: number,
  wordCount: number
): Promise<string> {
  const content: any[] = [
    {
      type: "text",
      text:
        `Перед тобой сканированные страницы ${fromPage}–${toPage} из книги/учебника.\n\n` +
        `ВАЖНО: читай ТОЛЬКО то, что реально написано на страницах. НЕ придумывай и НЕ добавляй информацию от себя.\n\n` +
        `Задача: внимательно прочитай весь текст на изображениях и составь подробный пересказ (~${wordCount} слов):\n` +
        `— Точно передай все факты, события, определения, даты, имена из текста\n` +
        `— Сохрани структуру (параграфы, главы, разделы)\n` +
        `— Отвечай на том же языке, на котором написан текст\n` +
        `— Если текст плохо виден — укажи это, но не придумывай содержимое\n` +
        `— Без предисловий типа "На этих страницах..." — сразу по сути`,
    },
    ...images.map((img) => ({
      type: "image_url" as const,
      image_url: { url: `data:image/jpeg;base64,${img.toString("base64")}` },
    })),
  ];
  return openrouterRequest([{ role: "user", content }], MODEL_UTILS);
}

// ─── Gemini: retell chunk from text ──────────────────────────────────────────

async function geminiChunkFromText(
  text: string,
  fromPage: number,
  toPage: number,
  wordCount: number
): Promise<string> {
  const prompt =
    `Тебе дан текст со страниц/глав ${fromPage}–${toPage}.\n\n` +
    `ВАЖНО: пересказывай СТРОГО по тексту. НЕ добавляй знания от себя, не придумывай.\n\n` +
    `Составь подробный пересказ (~${wordCount} слов):\n` +
    `— Точно передай все факты, события, даты, имена, определения из текста\n` +
    `— Сохрани структуру и логику изложения\n` +
    `— Отвечай на том же языке, что и текст\n` +
    `— Сразу по сути, без вводных фраз\n\n` +
    `ТЕКСТ:\n${text.length > 30000 ? text.slice(0, 30000) + "..." : text}`;
  return openrouterRequest([{ role: "user", content: prompt }], MODEL_UTILS);
}

// ─── Gemini: merge all chunk summaries ───────────────────────────────────────

async function geminiMergeChunks(
  chunks: { from: number; to: number; text: string }[],
  fromPage: number,
  toPage: number,
  wordCount: number,
  isPageBased: boolean
): Promise<string> {
  const unit = isPageBased ? "страницы" : "главы";
  const nonEmpty = chunks.filter(c => c.text.trim().length > 0);
  if (nonEmpty.length === 0) throw new Error("Все части документа вернули пустой результат — не удалось прочитать страницы.");
  if (nonEmpty.length === 1) return nonEmpty[0].text;
  const combined = nonEmpty
    .map(c => `[${unit} ${c.from}–${c.to}]:\n${c.text}`)
    .join("\n\n---\n\n");

  const prompt =
    `У тебя есть пересказы нескольких частей книги/документа (${unit} ${fromPage}–${toPage}).\n\n` +
    `ВАЖНО: объединяй ТОЛЬКО то, что есть в этих пересказах. НЕ добавляй ничего от себя.\n\n` +
    `Объедини в единый связный пересказ объёмом ~${wordCount} слов:\n` +
    `— Сохрани все факты, даты, имена, определения\n` +
    `— Сохрани хронологию и логику изложения\n` +
    `— Убери повторения, но не теряй важные детали\n` +
    `— Отвечай на языке текста\n\n` +
    `ЧАСТИ:\n${combined}`;
  return openrouterRequest([{ role: "user", content: prompt }], MODEL_UTILS);
}

// ─── Batch processor ──────────────────────────────────────────────────────────

type ChunkFn = (from: number, to: number) => Promise<string>;

async function processBatches(
  fromPage: number,
  toPage: number,
  chunkFn: ChunkFn,
  interaction: ChatInputCommandInteraction,
  isPageBased: boolean,
  wordCount: number,
  chunkSize: number = CHUNK_SIZE
): Promise<string> {
  const unit = isPageBased ? "стр." : "гл.";
  const totalPages = toPage - fromPage + 1;
  const numChunks = Math.ceil(totalPages / chunkSize);

  if (numChunks === 1) {
    const result = await chunkFn(fromPage, toPage);
    return result;
  }

  const chunkResults: { from: number; to: number; text: string }[] = [];
  const wordsPerChunk = Math.max(200, Math.round((wordCount / numChunks) * 1.2));

  for (let i = 0; i < numChunks; i++) {
    const chunkFrom = fromPage + i * chunkSize;
    const chunkTo = Math.min(toPage, chunkFrom + chunkSize - 1);
    await interaction.editReply(
      `🔄 Обрабатываю часть ${i + 1}/${numChunks} (${unit} ${chunkFrom}–${chunkTo})...`
    );
    const partial = await chunkFn(chunkFrom, chunkTo);
    if (partial.trim().length > 0) {
      chunkResults.push({ from: chunkFrom, to: chunkTo, text: partial });
    } else {
      console.warn(`[retell] Chunk ${chunkFrom}–${chunkTo} returned empty result`);
    }
  }

  if (chunkResults.length === 0) {
    throw new Error("Не удалось прочитать ни одну страницу из указанного диапазона. Возможно, файл повреждён или страницы не содержат распознаваемого текста.");
  }

  if (chunkResults.length === 1) return chunkResults[0].text;

  await interaction.editReply(`🔗 Объединяю ${chunkResults.length} части в единый пересказ...`);
  return geminiMergeChunks(chunkResults, fromPage, toPage, wordCount, isPageBased);
}

// ─── /пересказ handler ────────────────────────────────────────────────────────

export async function handleRetell(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply();

  const attachment = interaction.options.getAttachment("файл", true);
  const fromPage = interaction.options.getInteger("от_страницы", true);
  const toPage = interaction.options.getInteger("до_страницы", true);
  const wordCount = interaction.options.getInteger("слов") ?? 400;

  if (fromPage < 1 || toPage < fromPage) {
    await interaction.editReply("❌ Неверный диапазон: **от_страницы** должно быть ≤ **до_страницы** и ≥ 1.");
    return;
  }

  if (toPage - fromPage + 1 > MAX_PAGES) {
    await interaction.editReply(`❌ Максимум **${MAX_PAGES} страниц** за один запрос.`);
    return;
  }

  const fileName = attachment.name?.toLowerCase() ?? "";
  const isPdf  = fileName.endsWith(".pdf")  || (attachment.contentType ?? "").includes("pdf");
  const isEpub = fileName.endsWith(".epub");
  const isDjvu = fileName.endsWith(".djvu") || fileName.endsWith(".djv") || (attachment.contentType ?? "").includes("djvu");

  if (!isPdf && !isEpub && !isDjvu) {
    await interaction.editReply("❌ Поддерживаются файлы **PDF**, **EPUB** и **DjVu**.");
    return;
  }

  if (attachment.size > 100 * 1024 * 1024) {
    await interaction.editReply("❌ Файл слишком большой. Максимум — **100 МБ**.");
    return;
  }

  await interaction.editReply("⏳ Загружаю файл...");
  let buffer: Buffer;
  try {
    buffer = await downloadBuffer(attachment.url);
  } catch (err: any) {
    await interaction.editReply(`❌ Не удалось скачать файл: \`${String(err?.message ?? err).substring(0, 200)}\``);
    return;
  }

  const isPageBased = isPdf || isDjvu;
  const totalPages = toPage - fromPage + 1;
  const numChunks = Math.ceil(totalPages / CHUNK_SIZE);
  const wordsPerChunk = Math.max(200, Math.round((wordCount / numChunks) * 1.2));
  const djvuNumChunks = Math.ceil(totalPages / DJVU_CHUNK_SIZE);
  const djvuWordsPerChunk = Math.max(200, Math.round((wordCount / djvuNumChunks) * 1.2));

  let retelling = "";

  // ── EPUB ──────────────────────────────────────────────────────────────────
  if (isEpub) {
    try {
      await interaction.editReply("📖 Извлекаю текст из EPUB...");
      const chapters = await extractEpubChapters(buffer);
      if (chapters.length === 0) { await interaction.editReply("❌ Не удалось прочитать EPUB."); return; }

      const chunkFn: ChunkFn = async (from, to) => {
        const text = chapters.slice(from - 1, to).join("\n\n").trim();
        if (text.length < 50) return "";
        return geminiChunkFromText(text, from, to, wordsPerChunk);
      };

      retelling = await processBatches(fromPage, toPage, chunkFn, interaction, false, wordCount);
    } catch (err: any) {
      await interaction.editReply(`❌ Ошибка EPUB:\n\`\`\`${String(err?.message ?? err).substring(0, 300)}\`\`\``);
      return;
    }
  }

  // ── PDF ───────────────────────────────────────────────────────────────────
  else if (isPdf) {
    const tmpPdf = path.join(os.tmpdir(), `retell_${Date.now()}.pdf`);
    fs.writeFileSync(tmpPdf, buffer);

    try {
      await interaction.editReply("📖 Читаю PDF...");
      let hasPdfText = false;
      let sampleText = "";
      try {
        sampleText = await extractPdfText(buffer, fromPage, Math.min(toPage, fromPage + 2));
        hasPdfText = sampleText.length >= 200;
      } catch { /* fall through */ }

      if (hasPdfText) {
        const chunkFn: ChunkFn = async (from, to) => {
          const text = await extractPdfText(buffer, from, to);
          return geminiChunkFromText(text, from, to, wordsPerChunk);
        };
        retelling = await processBatches(fromPage, toPage, chunkFn, interaction, true, wordCount);
      } else {
        await interaction.editReply("🖼️ Сканированный PDF — читаю визуально...");
        const chunkFn: ChunkFn = async (from, to) => {
          const images = await convertPdfChunk(tmpPdf, from, to);
          if (images.length === 0) return "";
          return geminiChunkFromImages(images, from, to, wordsPerChunk);
        };
        retelling = await processBatches(fromPage, toPage, chunkFn, interaction, true, wordCount);
      }
    } catch (err: any) {
      await interaction.editReply(`❌ Ошибка PDF:\n\`\`\`${String(err?.message ?? err).substring(0, 300)}\`\`\``);
      return;
    } finally {
      try { fs.unlinkSync(tmpPdf); } catch { /* ignore */ }
    }
  }

  // ── DjVu ──────────────────────────────────────────────────────────────────
  else if (isDjvu) {
    const tmpDjvu = path.join(os.tmpdir(), `retell_${Date.now()}.djvu`);
    fs.writeFileSync(tmpDjvu, buffer);

    try {
      // ── Шаг 1: Пробуем визуальную конвертацию через ImageMagick (работает с любым DjVu) ──
      await interaction.editReply("🖼️ Читаю DjVu (визуальная конвертация)...");

      let magickWorks = false;
      try {
        const testImages = await convertDjvuChunkWithMagick(tmpDjvu, fromPage, Math.min(fromPage, toPage));
        magickWorks = testImages.length > 0;
      } catch { /* magick не поддерживает этот файл */ }

      if (magickWorks) {
        const chunkFn: ChunkFn = async (from, to) => {
          const images = await convertDjvuChunkWithMagick(tmpDjvu, from, to);
          if (images.length === 0) return "";
          return geminiChunkFromImages(images, from, to, djvuWordsPerChunk);
        };
        retelling = await processBatches(fromPage, toPage, chunkFn, interaction, true, wordCount, DJVU_CHUNK_SIZE);
      } else {
        // ── Шаг 2: Fallback — пробуем текстовый слой ──
        await interaction.editReply("📖 Визуальная конвертация недоступна, пробую текстовый слой...");

        let allPageTexts: string[] = [];
        try {
          allPageTexts = extractDjVuPageTexts(buffer);
        } catch { /* игнорируем */ }

        const hasText = allPageTexts.some((t) => t.length > 20);
        if (!hasText) {
          await interaction.editReply(
            "❌ Не удалось обработать DjVu файл:\n" +
            "• ImageMagick не смог конвертировать страницы\n" +
            "• Файл не содержит текстового слоя\n\n" +
            "💡 Попробуй конвертировать файл в PDF (например, через **Smallpdf** или **IlovePDF**) и загрузить PDF."
          );
          return;
        }

        const chunkFn: ChunkFn = async (from, to) => {
          const text = extractDjvuChunkText(allPageTexts, from, to);
          if (text.length < 30) return "";
          return geminiChunkFromText(text, from, to, djvuWordsPerChunk);
        };
        retelling = await processBatches(fromPage, toPage, chunkFn, interaction, true, wordCount);
      }
    } catch (err: any) {
      await interaction.editReply(`❌ Ошибка DjVu:\n\`\`\`${String(err?.message ?? err).substring(0, 300)}\`\`\``);
      return;
    } finally {
      try { fs.unlinkSync(tmpDjvu); } catch { /* ignore */ }
    }
  }

  if (!retelling || retelling.trim().length < 10) {
    await interaction.editReply("❌ Gemini не смог составить пересказ. Попробуй ещё раз.");
    return;
  }

  const fromLabel = isPageBased ? `страница ${fromPage}` : `глава ${fromPage}`;
  const toLabel   = isPageBased ? `страница ${toPage}`   : `глава ${toPage}`;
  const titleLabel = isPageBased
    ? `Страницы ${fromPage}–${toPage}`
    : `Главы ${fromPage}–${toPage}`;

  const embed = new EmbedBuilder()
    .setColor(0x7B2FBE)
    .setTitle(`📚 Пересказ — ${titleLabel}`)
    .setDescription(retelling.substring(0, 4000))
    .addFields(
      { name: "📄 Файл",    value: `\`${attachment.name}\``,         inline: true },
      { name: "📖 Диапазон", value: `${fromLabel} → ${toLabel}`,     inline: true },
      { name: "📑 Страниц", value: `${totalPages} (${numChunks} ${numChunks === 1 ? "часть" : numChunks < 5 ? "части" : "частей"})`, inline: true },
    )
    .setFooter({ text: `Gemini AI • Визуальное чтение • ~${wordCount} слов` })
    .setTimestamp();

  const PAGE_SIZE = 4000;
  const parts: string[] = [];
  for (let i = 0; i < retelling.length; i += PAGE_SIZE) {
    parts.push(retelling.substring(i, i + PAGE_SIZE));
  }

  if (parts.length > 1) {
    embed.setTitle(`📚 Пересказ — ${titleLabel} (часть 1/${parts.length})`);
  }

  await interaction.editReply({ content: "", embeds: [embed] });

  for (let i = 1; i < parts.length; i++) {
    const contEmbed = new EmbedBuilder()
      .setColor(0x7B2FBE)
      .setTitle(`📚 Пересказ — ${titleLabel} (часть ${i + 1}/${parts.length})`)
      .setDescription(parts[i])
      .setFooter({ text: `Gemini AI • ~${wordCount} слов` });
    await interaction.followUp({ embeds: [contEmbed] });
  }
}
