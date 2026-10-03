import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";

/**
 * Diário de Obras — armazenamento de fotos.
 *
 * Grava em disco, dentro de um diretório configurável via UPLOAD_DIR. Em
 * produção (Railway), UPLOAD_DIR deve apontar para um Volume persistente
 * (ex.: /data/site-diary) — sem isso, as fotos somem a cada novo deploy,
 * porque o resto do filesystem do container é recriado do zero.
 *
 * Em desenvolvimento local, sem UPLOAD_DIR configurado, cai num diretório
 * `uploads/site-diary` dentro do próprio projeto (ignorado pelo git).
 */
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.resolve(process.cwd(), "uploads", "site-diary");

const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8MB por foto — generoso pra foto de celular, sem permitir abuso

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

let dirReady = false;
async function ensureDir() {
  if (dirReady) return;
  await mkdir(UPLOAD_DIR, { recursive: true });
  dirReady = true;
}

/** Valida e decodifica uma data URL (ex.: "data:image/jpeg;base64,/9j/4AAQ..."). */
function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const match = /^data:([a-zA-Z0-9/+.-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("Formato de imagem inválido — esperado data URL base64.");
  }
  const mime = match[1].toLowerCase();
  if (!MIME_TO_EXT[mime]) {
    throw new Error(`Tipo de imagem não suportado: ${mime}`);
  }
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.byteLength > MAX_PHOTO_BYTES) {
    throw new Error("Foto maior que 8MB — reduza a qualidade antes de enviar.");
  }
  return { mime, buffer };
}

/** Salva uma foto (data URL) no volume e retorna o nome do arquivo gravado. */
export async function saveDiaryPhoto(dataUrl: string): Promise<string> {
  await ensureDir();
  const { mime, buffer } = parseDataUrl(dataUrl);
  const ext = MIME_TO_EXT[mime];
  const fileName = `${randomUUID()}.${ext}`;
  await writeFile(path.join(UPLOAD_DIR, fileName), buffer);
  return fileName;
}

/** Lê o conteúdo de uma foto gravada, pra servir via rota HTTP protegida. */
export async function readDiaryPhoto(fileName: string): Promise<Buffer> {
  assertSafeFileName(fileName);
  return readFile(path.join(UPLOAD_DIR, fileName));
}

/** Remove uma foto do volume (ex.: ao excluir a entrada do diário). */
export async function deleteDiaryPhoto(fileName: string): Promise<void> {
  assertSafeFileName(fileName);
  try {
    await unlink(path.join(UPLOAD_DIR, fileName));
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }
}

/** Bloqueia path traversal — fileName sempre vem do banco, mas defesa em profundidade. */
function assertSafeFileName(fileName: string) {
  if (!fileName || fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) {
    throw new Error("Nome de arquivo inválido");
  }
}
