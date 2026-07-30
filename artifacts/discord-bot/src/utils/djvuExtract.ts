import { inflateSync } from "zlib";

interface IFFChunk {
  id: string;
  data: Buffer;
}

function parseChunks(buf: Buffer, start: number, end: number): IFFChunk[] {
  const result: IFFChunk[] = [];
  let pos = start;

  while (pos + 8 <= end) {
    const id = buf.subarray(pos, pos + 4).toString("ascii");
    const size = buf.readUInt32BE(pos + 4);
    const dataStart = pos + 8;
    const dataEnd = dataStart + size;

    if (dataEnd > end + 2) break;

    const data = buf.subarray(dataStart, Math.min(dataEnd, buf.length));
    result.push({ id, data });

    pos = dataEnd + (size % 2 === 1 ? 1 : 0);
  }

  return result;
}

function extractTextFromChunks(chunks: IFFChunk[]): string | null {
  for (const chunk of chunks) {
    if (chunk.id === "TXTa") {
      return chunk.data.toString("utf8").replace(/\0/g, " ").replace(/\s+/g, " ").trim();
    }
    if (chunk.id === "TXTz") {
      try {
        const decompressed = inflateSync(chunk.data);
        return decompressed.toString("utf8").replace(/\0/g, " ").replace(/\s+/g, " ").trim();
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function extractDjVuPageTexts(buffer: Buffer): string[] {
  let offset = 0;

  if (buffer.subarray(0, 4).toString("ascii") === "AT&T") {
    offset = 4;
  }

  if (buffer.subarray(offset, offset + 4).toString("ascii") !== "FORM") {
    throw new Error("Файл не является корректным DjVu/IFF файлом");
  }

  const topSize = buffer.readUInt32BE(offset + 4);
  const topDataStart = offset + 8;
  const topData = buffer.subarray(topDataStart, topDataStart + topSize);
  const formType = topData.subarray(0, 4).toString("ascii");

  const pageTexts: string[] = [];

  if (formType === "DJVU") {
    const chunks = parseChunks(topData, 4, topData.length);
    const text = extractTextFromChunks(chunks);
    pageTexts.push(text ?? "");
  } else if (formType === "DJVM") {
    const chunks = parseChunks(topData, 4, topData.length);
    for (const chunk of chunks) {
      if (chunk.id === "FORM") {
        const subType = chunk.data.subarray(0, 4).toString("ascii");
        if (subType === "DJVU") {
          const subChunks = parseChunks(chunk.data, 4, chunk.data.length);
          const text = extractTextFromChunks(subChunks);
          pageTexts.push(text ?? "");
        }
      }
    }
  } else {
    throw new Error(`Неизвестный тип DjVu формата: ${formType}`);
  }

  return pageTexts;
}

export function hasDjVuTextLayer(buffer: Buffer): boolean {
  try {
    const texts = extractDjVuPageTexts(buffer);
    return texts.some((t) => t.length > 20);
  } catch {
    return false;
  }
}
