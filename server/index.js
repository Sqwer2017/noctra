import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Readable } from "node:stream";
import fs from "node:fs/promises";
import path from "node:path";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3001;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
// Публичный https-URL для webhook (заполняется на деплое). Пусто — webhook не активен.
const PUBLIC_URL = process.env.PUBLIC_URL || "";

if (!BOT_TOKEN) {
  console.error("Missing TELEGRAM_BOT_TOKEN in server/.env");
  process.exit(1);
}

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const TELEGRAM_FILE_API = `https://api.telegram.org/file/bot${BOT_TOKEN}`;

let lastUpdateId = 0;
let telegramTracks = [];

const DATA_DIR = path.join(process.cwd(), "data");
const TRACKS_FILE = path.join(DATA_DIR, "telegram-tracks.json");

async function loadStoredTelegramTracks() {
  try {
    const fileContent = await fs.readFile(TRACKS_FILE, "utf-8");
    telegramTracks = JSON.parse(fileContent);
    console.log(`Loaded ${telegramTracks.length} stored Telegram tracks`);
  } catch {
    telegramTracks = [];
  }
}

async function saveTelegramTracks() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(
    TRACKS_FILE,
    JSON.stringify(telegramTracks, null, 2),
    "utf-8",
  );
}

app.use(
  cors({
    origin: true,
    allowedHeaders: ["Content-Type", "Range"],
    exposedHeaders: [
      "Content-Type",
      "Content-Length",
      "Content-Range",
      "Accept-Ranges",
    ],
  }),
);
app.use(express.json());

const AUDIO_EXTENSION = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|mp4|m4b)$/i;

/**
 * Извлекает аудио-вложение из сообщения Telegram.
 * Поддерживает:
 *  - message.audio    — музыкальный трек (title/performer/duration/thumbnail)
 *  - message.voice    — голосовое (ogg/opus), без метаданных
 *  - message.document — файл с mime audio/* или аудио-расширением
 *  - message.video_note / прочее с mime audio/* — на будущее
 */
function extractAudioAttachment(message) {
  if (!message) return null;

  if (message.audio) return { file: message.audio, kind: "audio" };
  if (message.voice) return { file: message.voice, kind: "voice" };

  const document = message.document;
  if (document) {
    const mime = document.mime_type ?? "";
    const name = document.file_name ?? "";
    if (mime.startsWith("audio/") || AUDIO_EXTENSION.test(name)) {
      return { file: document, kind: "document" };
    }
  }

  return null;
}

function secondsToDuration(seconds) {
  if (!seconds || Number.isNaN(seconds)) return "0:00";

  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;

  return `${minutes}:${String(restSeconds).padStart(2, "0")}`;
}

function buildFileUrl(fileId) {
  return `http://localhost:${PORT}/api/telegram/file?fileId=${encodeURIComponent(
    fileId,
  )}`;
}

function extractTrackFromMessage(message) {
  const attachment = extractAudioAttachment(message);
  if (!attachment) return null;

  const { file, kind } = attachment;
  const fileId = file.file_id;
  const uniqueId = file.file_unique_id ?? fileId;

  const thumbnail = file.thumbnail || null;
  const thumbnailFileId = thumbnail?.file_id ?? null;

  const document = message.document;
  const audio = message.audio;

  // Название: у audio — title; у document — имя файла без расширения;
  // у voice — «Voice message»; иначе caption.
  const rawTitle =
    audio?.title ||
    (document?.file_name ? document.file_name.replace(/\.[^/.]+$/, "") : "") ||
    message.caption ||
    (kind === "voice" ? "Voice message" : "Telegram track");

  const artist = audio?.performer || "Telegram";

  const durationSeconds = audio?.duration ?? file.duration ?? 0;

  return {
    id: `tg-${uniqueId}`,
    fileId,
    title: rawTitle,
    artist,
    kind,
    thumbnailFileId,
    coverUrl: thumbnailFileId ? buildFileUrl(thumbnailFileId) : null,
    source: "Telegram",
    duration: secondsToDuration(durationSeconds),
    // Метаданные чата-источника (для дебага/группировки по каналам).
    chatId: message.chat?.id ?? null,
    chatTitle: message.chat?.title ?? message.chat?.username ?? null,
    streamUrl: buildFileUrl(fileId),
  };
}

/**
 * Обрабатывает один update Telegram. Общая логика для поллинга и webhook.
 * Возвращает добавленный трек или null.
 */
async function processTelegramUpdate(update) {
  if (!update) return null;

  lastUpdateId = Math.max(lastUpdateId, update.update_id ?? 0);

  const message =
    update.message || update.channel_post || update.edited_channel_post;

  if (!message) return null;

  console.log("Telegram update:", {
    updateId: update.update_id,
    type: update.message
      ? "message"
      : update.channel_post
        ? "channel_post"
        : "edited_channel_post",
    chatTitle: message?.chat?.title,
    chatType: message?.chat?.type,
    hasAudio: Boolean(message?.audio),
    hasVoice: Boolean(message?.voice),
    hasDocument: Boolean(message?.document),
    hasThumbnail: Boolean(
      message?.audio?.thumbnail || message?.document?.thumbnail,
    ),
  });

  const track = extractTrackFromMessage(message);
  if (!track) return null;

  const alreadyExists = telegramTracks.some((item) => item.id === track.id);
  if (alreadyExists) return null;

  telegramTracks = [track, ...telegramTracks];
  await saveTelegramTracks();

  return track;
}

async function syncTelegramUpdates() {
  const updatesUrl = new URL(`${TELEGRAM_API}/getUpdates`);

  if (lastUpdateId > 0) {
    updatesUrl.searchParams.set("offset", String(lastUpdateId + 1));
  }

  updatesUrl.searchParams.set(
    "allowed_updates",
    JSON.stringify(["message", "channel_post", "edited_channel_post"]),
  );

  const response = await fetch(updatesUrl);

  if (!response.ok) {
    throw new Error(`Telegram getUpdates failed: ${response.status}`);
  }

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.description || "Telegram getUpdates error");
  }

  for (const update of data.result) {
    await processTelegramUpdate(update);
  }

  return telegramTracks;
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "noctra-telegram-server",
    webhookActive: Boolean(PUBLIC_URL),
    tracks: telegramTracks.length,
  });
});

app.get("/api/telegram/tracks", (req, res) => {
  res.json({
    ok: true,
    tracks: telegramTracks,
  });
});

app.post("/api/telegram/sync", async (req, res) => {
  try {
    const tracks = await syncTelegramUpdates();

    res.json({
      ok: true,
      tracks,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Unknown server error",
    });
  }
});

/* ── Webhook-задел (для деплоя) ────────────────────────────────────────
 * Поллинг остаётся основным режимом локально. На деплое можно вызвать
 * POST /api/telegram/webhook/set — тогда Telegram сам шлёт апдейты на
 * публичный URL, а /api/telegram/webhook их принимает.
 */
app.get("/api/telegram/webhook/info", async (req, res) => {
  try {
    const response = await fetch(`${TELEGRAM_API}/getWebhookInfo`);
    const data = await response.json();
    res.json({ ok: data.ok, info: data.result ?? null, publicUrl: PUBLIC_URL || null });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "webhook info error",
    });
  }
});

app.post("/api/telegram/webhook/set", async (req, res) => {
  if (!PUBLIC_URL) {
    return res.status(400).json({
      ok: false,
      message: "PUBLIC_URL is not configured in server/.env",
    });
  }

  try {
    const webhookUrl = `${PUBLIC_URL.replace(/\/$/, "")}/api/telegram/webhook`;
    const response = await fetch(
      `${TELEGRAM_API}/setWebhook?url=${encodeURIComponent(webhookUrl)}`,
    );
    const data = await response.json();
    res.json({ ok: data.ok, description: data.description, webhookUrl });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "setWebhook error",
    });
  }
});

app.post("/api/telegram/webhook/delete", async (req, res) => {
  try {
    const response = await fetch(`${TELEGRAM_API}/deleteWebhook`);
    const data = await response.json();
    res.json({ ok: data.ok, description: data.description });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "deleteWebhook error",
    });
  }
});

// Приём апдейтов от Telegram (при активном webhook).
app.post("/api/telegram/webhook", async (req, res) => {
  try {
    await processTelegramUpdate(req.body);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    // Всегда 200, чтобы Telegram не ретраил бесконечно при логической ошибке.
    res.json({ ok: false });
  }
});

app.get("/api/telegram/file", async (req, res) => {
  try {
    const fileId = req.query.fileId;

    if (!fileId || typeof fileId !== "string") {
      return res.status(400).json({
        ok: false,
        message: "Missing fileId",
      });
    }

    const rangeHeader = req.headers.range;

    const fileInfoResponse = await fetch(
      `${TELEGRAM_API}/getFile?file_id=${encodeURIComponent(fileId)}`,
    );

    if (!fileInfoResponse.ok) {
      throw new Error(`Telegram getFile failed: ${fileInfoResponse.status}`);
    }

    const fileInfo = await fileInfoResponse.json();

    if (!fileInfo.ok) {
      throw new Error(fileInfo.description || "Telegram getFile error");
    }

    const filePath = fileInfo.result.file_path;
    const fileUrl = `${TELEGRAM_FILE_API}/${filePath}`;

    const telegramHeaders = {};

    if (rangeHeader) {
      telegramHeaders.Range = rangeHeader;
    }

    const fileResponse = await fetch(fileUrl, {
      headers: telegramHeaders,
    });

    if (!fileResponse.ok || !fileResponse.body) {
      throw new Error(`Telegram file download failed: ${fileResponse.status}`);
    }

    const contentType =
      fileResponse.headers.get("content-type") || "audio/mpeg";

    const contentLength = fileResponse.headers.get("content-length");
    const contentRange = fileResponse.headers.get("content-range");

    res.setHeader("Content-Type", contentType);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "no-store");

    if (rangeHeader && fileResponse.status === 206) {
      res.status(206);

      if (contentRange) {
        res.setHeader("Content-Range", contentRange);
      }

      if (contentLength) {
        res.setHeader("Content-Length", contentLength);
      }
    } else {
      res.status(fileResponse.status);

      if (contentLength) {
        res.setHeader("Content-Length", contentLength);
      }
    }

    Readable.fromWeb(fileResponse.body).pipe(res);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Unknown server error",
    });
  }
});

await loadStoredTelegramTracks();

app.listen(PORT, () => {
  console.log(`Noctra Telegram server running on http://localhost:${PORT}`);
});
