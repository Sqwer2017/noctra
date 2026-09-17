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
// Публичный https-URL сервиса (заполняется на деплое).
// Используется и для webhook, и для сборки абсолютных ссылок на аудио.
// Пусто — работаем на localhost (локальная разработка).
const PUBLIC_URL = (process.env.PUBLIC_URL || "").replace(/\/+$/, "");

if (!BOT_TOKEN) {
  console.error("Missing TELEGRAM_BOT_TOKEN in server/.env");
  process.exit(1);
}

/**
 * Адрес, по которому клиенты достают аудио.
 *
 * Раньше здесь был жёстко зашит `http://localhost:${PORT}`, и этот адрес
 * запекался в сохранённые треки. На проде (Render) фронтенд получал ссылки
 * на localhost и не мог воспроизвести ни один трек.
 */
const SELF_ORIGIN = PUBLIC_URL || `http://localhost:${PORT}`;

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const TELEGRAM_FILE_API = `https://api.telegram.org/file/bot${BOT_TOKEN}`;

let lastUpdateId = 0;
let telegramTracks = [];

const DATA_DIR = path.join(process.cwd(), "data");
const TRACKS_FILE = path.join(DATA_DIR, "telegram-tracks.json");

/**
 * Переписывает устаревшие localhost-ссылки на актуальный origin.
 *
 * В уже сохранённой базе (177 треков) лежат URL вида
 * `http://localhost:3001/api/telegram/file?...`. Без этой правки они
 * оставались бы битыми и после деплоя фикса, потому что читаются из файла
 * как есть. Путь и query сохраняем — меняем только хост.
 */
function repairStoredUrl(url) {
  if (typeof url !== "string" || !url) return url ?? null;

  const localhostMatch = url.match(
    /^https?:\/\/(?:localhost|127\.0\.0\.1)(?:\:\d+)?(\/.*)?$/i,
  );

  if (!localhostMatch) return url;

  return `${SELF_ORIGIN}${localhostMatch[1] ?? ""}`;
}

/** Применяет repairStoredUrl ко всем ссылкам трека. */
function repairStoredTrack(track) {
  return {
    ...track,
    streamUrl: repairStoredUrl(track.streamUrl),
    coverUrl: repairStoredUrl(track.coverUrl),
  };
}

async function loadStoredTelegramTracks() {
  try {
    const fileContent = await fs.readFile(TRACKS_FILE, "utf-8");
    const parsed = JSON.parse(fileContent);
    const tracks = Array.isArray(parsed) ? parsed : [];

    // Чиним ссылки прошлых синков прямо в памяти: запись в файл не нужна,
    // а клиент сразу получает рабочие адреса.
    telegramTracks = tracks.map(repairStoredTrack);

    const repairedCount = tracks.filter(
      (track) =>
        repairStoredUrl(track.streamUrl) !== track.streamUrl ||
        repairStoredUrl(track.coverUrl) !== track.coverUrl,
    ).length;

    console.log(`Loaded ${telegramTracks.length} stored Telegram tracks`);

    if (repairedCount > 0) {
      console.log(`Repaired ${repairedCount} tracks with stale localhost URLs`);
    }
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

/**
 * CORS.
 *
 * `origin: true` отражал вообще любой Origin — это лишняя широта для прода.
 * Теперь разрешаем явный список из CORS_ORIGINS (через запятую) плюс
 * localhost для разработки. Если список не задан, ведём себя как раньше
 * (отражаем Origin): так деплой не сломается, если переменную забыли.
 *
 * Учётные данные не используются (у нас anon-ключ и токен в query), поэтому
 * отражение Origin безопасно, и preflight от `cors` обрабатывается сам.
 */
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

function isAllowedOrigin(origin) {
  // Запросы без Origin (curl, health-check, server-to-server) пропускаем.
  if (!origin) return true;

  // Список не настроен — оставляем прежнее поведение.
  if (CORS_ORIGINS.length === 0) return true;

  if (CORS_ORIGINS.includes(origin)) return true;

  // Локальная разработка: любой порт localhost/127.0.0.1.
  return /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin);
}

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      console.warn(`CORS: отклонён origin ${origin}`);
      callback(null, false);
    },
    allowedHeaders: ["Content-Type", "Range"],
    methods: ["GET", "POST", "OPTIONS"],
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
  return `${SELF_ORIGIN}/api/telegram/file?fileId=${encodeURIComponent(fileId)}`;
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

/**
 * Поиск на YouTube через зеркала Invidious.
 *
 * ЗАЧЕМ ПРОКСИ, А НЕ ЗАПРОС ИЗ БРАУЗЕРА
 * -------------------------------------
 * Публичные зеркала Invidious почти все запрещают запросы с чужих доменов:
 * отдают `Access-Control-Allow-Origin` со своим адресом вместо `*`. Браузер
 * такой ответ блокирует, и поиск падает с ошибкой CORS, хотя само зеркало
 * исправно. Из десяти проверенных зеркал из браузера работало ОДНО.
 *
 * Запрос с сервера этих ограничений не знает: CORS — правило браузера, а не
 * сети. Поэтому перебираем зеркала здесь и отдаём клиенту уже готовый JSON.
 * Заодно снимается проблема со сменой зеркал: клиенту не нужно знать,
 * какие из них живы сейчас.
 *
 * Официальный YouTube Data API не используем: у него квота 100 поисков
 * в сутки, которой не хватит даже небольшой аудитории.
 */

/** Зеркала: перебираются по очереди, пока одно не ответит. */
const YOUTUBE_MIRRORS = [
  "https://invidious.f5.si",
  "https://invidious.materialio.us",
  "https://invidious.protokolla.fi",
  "https://yewtu.be",
  "https://inv.nadeko.net",
];

/** Сколько ждать ответа от одного зеркала. */
const YOUTUBE_MIRROR_TIMEOUT_MS = 5000;

/**
 * Сколько страниц запрашивать у зеркала.
 *
 * Одна страница Invidious отдаёт ровно 20 результатов — меньше, чем нужно
 * для нормального выбора. Параметр `page` работает: вторая страница почти
 * не пересекается с первой (проверено: 4 общих элемента из 20). Поэтому
 * берём несколько страниц параллельно и склеиваем результат.
 *
 * Три страницы — компромисс: до 60 результатов, что после отсева сборников
 * и коротких роликов даёт около 40 треков. Больше запрашивать смысла нет:
 * пользователь всё равно просматривает только начало списка, а время ответа
 * растёт.
 */
const YOUTUBE_SEARCH_PAGES = 3;

/** Запрашивает одну страницу поиска у зеркала. */
async function fetchYouTubePage(mirror, params, page, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const pageParams = new URLSearchParams(params);
    if (page > 1) pageParams.set("page", String(page));

    const response = await fetch(
      `${mirror}/api/v1/search?${pageParams.toString()}`,
      {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    /*
     * Проверяем тип содержимого: часть зеркал отдаёт 200 с HTML-страницей
     * вместо данных. Без этой проверки мы попытались бы разобрать HTML
     * как JSON и потратили попытку впустую.
     */
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("json")) {
      throw new Error("не JSON");
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("неожиданный формат");
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

app.get("/api/youtube/search", async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const mode = req.query.mode === "all" ? "all" : "music";

  if (!query) {
    return res.status(400).json({ ok: false, message: "Missing query" });
  }

  /*
   * Фильтр `music_songs` повышает приоритет музыки в выдаче.
   *
   * Важно: он не гарантирует чистоту результата — часть нецелевого контента
   * всё равно проходит. Дополнительный отсев по длительности делает клиент,
   * потому что там же он нужен и для подписи «микс».
   */
  const params = new URLSearchParams({ q: query, type: "video" });
  if (mode === "music") params.set("filter", "music_songs");

  const errors = [];

  for (const mirror of YOUTUBE_MIRRORS) {
    try {
      /*
       * Страницы запрашиваем параллельно: последовательно три запроса
       * заняли бы до 15 секунд, а так — время самой медленной страницы.
       */
      const pages = await Promise.all(
        Array.from({ length: YOUTUBE_SEARCH_PAGES }, (_, index) =>
          fetchYouTubePage(
            mirror,
            params,
            index + 1,
            YOUTUBE_MIRROR_TIMEOUT_MS,
          ).catch((error) => {
            // Одна упавшая страница не должна ломать весь поиск.
            errors.push(
              `${mirror} стр.${index + 1}: ${error instanceof Error ? error.message : "ошибка"}`,
            );
            return [];
          }),
        ),
      );

      /*
       * Склеиваем страницы без дублей.
       *
       * Invidious иногда повторяет одни и те же видео на соседних страницах
       * (проверено: 4 общих элемента из 20). Без дедупликации в списке
       * появились бы клоны.
       */
      const seen = new Set();
      const items = [];

      for (const page of pages) {
        for (const video of page) {
          const id = video?.videoId;
          if (!id || seen.has(id)) continue;

          seen.add(id);
          items.push(video);
        }
      }

      if (items.length === 0) {
        errors.push(`${mirror}: пустой результат`);
        continue;
      }

      console.log(
        `[youtube] поиск через ${mirror}: ${items.length} результатов ` +
          `(${pages.map((p) => p.length).join("+")}, дублей убрано ${pages.reduce((sum, p) => sum + p.length, 0) - items.length})`,
      );

      return res.json({ ok: true, items, mirror });
    } catch (error) {
      errors.push(
        `${mirror}: ${error instanceof Error ? error.message : "ошибка"}`,
      );
    }
  }

  console.warn("[youtube] все зеркала недоступны:", errors.join("; "));

  res.status(503).json({
    ok: false,
    message: "youtube_unreachable",
    details: errors,
  });
});

await loadStoredTelegramTracks();

app.listen(PORT, () => {
  console.log(`Noctra Telegram server running on http://localhost:${PORT}`);
});
