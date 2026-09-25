/**
 * Noctra Telegram Worker (Cloudflare Workers).
 *
 * ЧТО ИЗМЕНИЛОСЬ И ПОЧЕМУ
 * -----------------------
 * Раньше на каждое обращение к /api/telegram/file воркер заново спрашивал у
 * Telegram `getFile`, чтобы получить `file_path`. Метод ограничен частотой
 * 1 запрос в секунду, а `<audio>` на Android обращается к эндпоинту всплеском
 * (метаданные, буферизация, переподключение после сворачивания приложения).
 * Из-за этого на телефоне ловился 429, воркер отдавал клиенту неразличимый
 * 404, плеер считал трек битым и переходил к следующему — а тот снова попадал
 * в лимит. Очередь проматывалась целиком: «первый трек играет, второй нет».
 *
 * Исправления:
 *  1. `file_path` кэшируется в KV (35 минут) — запас к часу жизни ссылки.
 *  2. `retry_after` от Telegram пробрасывается клиенту как HTTP 429, а не 404.
 *     Плеер теперь умеет отличить «подожди» от «источник мёртв».
 *  3. Ответ самого KV кэшируется на CDN (5 минут) — пауза перед одним и тем же
 *     треком не доходит до сети вовсе.
 *  4. Свежие абсолютные ссылки на треки хранятся рядом (20 минут): Telegram
 *     отдаёт `file_path` с суточным сроком, а мы выдаём его только на час.
 */

const AUDIO_EXTENSION = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|mp4|m4b)$/i;

const YOUTUBE_MIRRORS = [
  "https://invidious.f5.si",
  "https://invidious.materialio.us",
  "https://invidious.protokolla.fi",
  "https://yewtu.be",
  "https://inv.nadeko.net",
];
const YOUTUBE_MIRROR_TIMEOUT_MS = 5000;
const YOUTUBE_SEARCH_PAGES = 3;

/*
 * Сроки жизни кэша.
 *
 * `file_path` живёт ЧАС. Держим 35 минут — с запасом на разницу часов и на то,
 * что ссылку могут начать использовать в конце окна. Продлевать нечем: метод
 * продления у Telegram Bot API нет, только получать путь заново.
 */
const FILE_PATH_TTL_SECONDS = 35 * 60;

/*
 * Ссылки на треки пересобираются по текущему origin и живут 20 минут.
 *
 * Короткий срок не про экономию: Telegram отдаёт `file_path`, который «не
 * гарантированно живёт час». Если хранить ссылки дольше, свежий кэш треков
 * начнёт массово отдавать просроченные адреса — и треки перестанут играть
 * ровно так же, как сейчас, только по другой причине.
 */
const TRACK_URL_TTL_SECONDS = 20 * 60;

/** Сколько ждать сбора батча апдейтов Telegram, если новых сообщений нет. */
const GET_UPDATES_TIMEOUT_SECONDS = 25;

/** Пауза перед повторной попыткой, если Telegram не назвал свой retry_after. */
const DEFAULT_RETRY_AFTER_SECONDS = 2;

// In-memory хранилище (на случай, если еще не подключен KV)
let memoryTracks = [];
let memoryLastUpdateId = 0;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Expose-Headers":
      "Content-Type, Content-Length, Content-Range, Accept-Ranges, Retry-After",
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

/* ─────────────────────────── Кэш ─────────────────────────── */

/**
 * Читает значение из KV, разбирая JSON.
 *
 * Ошибку чтения намеренно проглатываем: недоступный KV деградирует до
 * «кэша нет» и лишнего запроса к Telegram, но НЕ до отказа отдать трек.
 * Ронять воспроизведение из-за сбоя кэша нельзя.
 */
async function kvGetJson(env, key) {
  if (!env.NOCTRA_KV) return null;

  try {
    /*
     * `cacheTtl` НЕ передаём намеренно.
     *
     * Этот параметр включает промежуточный CDN-кэш Cloudflare, и он же ломает
     * главный сценарий: сразу после записи `file_path` чтение возвращает `null`,
     * пока кэш не прогреется. Проверено тестом — второй запрос к тому же файлу
     * снова уходил в `getFile`, то есть лимит Telegram мы бы не разгрузили.
     *
     * Полагаемся только на время жизни самой записи (expirationTtl при записи):
     * оно даёт ту же экономию запросов без задержки распространения.
     */
    return await env.NOCTRA_KV.get(key, { type: "json" });
  } catch (error) {
    console.error("KV read error:", key, error);
    return null;
  }
}

/** Пишет значение в KV. Ошибка записи не должна ломать ответ клиенту. */
async function kvPutJson(env, key, value, expirationTtl) {
  if (!env.NOCTRA_KV) return;

  try {
    await env.NOCTRA_KV.put(key, JSON.stringify(value), { expirationTtl });
  } catch (error) {
    console.error("KV write error:", key, error);
  }
}

/* ─────────────────────── Ссылки на треки ─────────────────────── */

/**
 * Оставляет от ссылки только путь и query.
 *
 * Абсолютный адрес запекать в кэш нельзя: origin воркера может смениться
 * (переезд с Fly на workers.dev, свой домен), и сохранённые ссылки станут
 * вести в никуда — именно эта ошибка была с localhost-URL на Render.
 * А так адрес собирается из origin текущего запроса.
 */
function toRelativeUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return rawUrl;

  try {
    const parsed = new URL(rawUrl);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    // Не URL (например, /api/... уже относительный) — оставляем как есть.
    return rawUrl;
  }
}

function relativizeTrack(track) {
  return {
    ...track,
    streamUrl: toRelativeUrl(track.streamUrl),
    coverUrl: toRelativeUrl(track.coverUrl),
  };
}

/** Приклеивает origin воркера к относительным ссылкам трека. */
function absolutizeTrack(track, selfOrigin) {
  const build = (rawUrl) =>
    typeof rawUrl === "string" && rawUrl.startsWith("/")
      ? `${selfOrigin}${rawUrl}`
      : rawUrl;

  return {
    ...track,
    streamUrl: build(track.streamUrl),
    coverUrl: build(track.coverUrl),
  };
}

async function getStoredData(env, selfOrigin) {
  if (env.NOCTRA_KV) {
    try {
      const data = await env.NOCTRA_KV.get("telegram_data", { type: "json" });
      if (data) {
        const tracks = Array.isArray(data.tracks) ? data.tracks : [];
        return {
          tracks: tracks.map((t) => absolutizeTrack(t, selfOrigin)),
          lastUpdateId: data.lastUpdateId || 0,
        };
      }
    } catch (e) {
      console.error("KV read error:", e);
    }
  }
  return {
    tracks: memoryTracks.map((t) => absolutizeTrack(t, selfOrigin)),
    lastUpdateId: memoryLastUpdateId,
  };
}

async function saveStoredData(env, tracks, lastUpdateId) {
  // В память и KV кладём ОТНОСИТЕЛЬНЫЕ ссылки: абсолютные привязали бы кэш
  // к конкретному origin и сломались бы при смене домена.
  const relative = tracks.map(relativizeTrack);

  memoryTracks = relative;
  memoryLastUpdateId = lastUpdateId;

  if (env.NOCTRA_KV) {
    try {
      await env.NOCTRA_KV.put(
        "telegram_data",
        JSON.stringify({ tracks: relative, lastUpdateId }),
      );
    } catch (e) {
      console.error("KV write error:", e);
    }
  }
}

function secondsToDuration(seconds) {
  if (!seconds || Number.isNaN(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  return `${minutes}:${String(restSeconds).padStart(2, "0")}`;
}

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

function extractTrackFromMessage(message, selfOrigin) {
  const attachment = extractAudioAttachment(message);
  if (!attachment) return null;

  const { file, kind } = attachment;
  const fileId = file.file_id;
  const uniqueId = file.file_unique_id ?? fileId;

  const thumbnail = file.thumbnail || null;
  const thumbnailFileId = thumbnail?.file_id ?? null;

  const document = message.document;
  const audio = message.audio;

  const rawTitle =
    audio?.title ||
    (document?.file_name ? document.file_name.replace(/\.[^/.]+$/, "") : "") ||
    message.caption ||
    (kind === "voice" ? "Voice message" : "Telegram track");

  const artist = audio?.performer || "Telegram";
  const durationSeconds = audio?.duration ?? file.duration ?? 0;

  const buildFileUrl = (fid) =>
    `${selfOrigin}/api/telegram/file?fileId=${encodeURIComponent(fid)}`;

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
    chatId: message.chat?.id ?? null,
    chatTitle: message.chat?.title ?? message.chat?.username ?? null,
    streamUrl: buildFileUrl(fileId),
  };
}

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

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("json")) throw new Error("не JSON");

    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("неожиданный формат");
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const selfOrigin = url.origin;
    const BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (!BOT_TOKEN) {
      return jsonResponse({ ok: false, message: "Missing TELEGRAM_BOT_TOKEN" }, 500);
    }

    const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
    const TELEGRAM_FILE_API = `https://api.telegram.org/file/bot${BOT_TOKEN}`;

    // 1. Health check
    if (url.pathname === "/api/health" || url.pathname === "/health") {
      const { tracks } = await getStoredData(env, selfOrigin);
      return jsonResponse({
        ok: true,
        service: "noctra-telegram-worker",
        tracks: tracks.length,
        kv: Boolean(env.NOCTRA_KV),
      });
    }

    // 2. Получение треков
    if (url.pathname === "/api/telegram/tracks") {
      const { tracks } = await getStoredData(env, selfOrigin);
      return jsonResponse({ ok: true, tracks });
    }

    // 3. Синхронизация треков из Telegram
    if (url.pathname === "/api/telegram/sync" && request.method === "POST") {
      try {
        let { tracks, lastUpdateId } = await getStoredData(env, selfOrigin);
        const updatesUrl = new URL(`${TELEGRAM_API}/getUpdates`);

        if (lastUpdateId > 0) {
          updatesUrl.searchParams.set("offset", String(lastUpdateId + 1));
        }
        updatesUrl.searchParams.set(
          "allowed_updates",
          JSON.stringify(["message", "channel_post", "edited_channel_post"]),
        );
        updatesUrl.searchParams.set(
          "timeout",
          String(GET_UPDATES_TIMEOUT_SECONDS),
        );

        const response = await fetch(updatesUrl);

        if (response.status === 409) {
          let webhookUrl = null;
          try {
            const infoRes = await fetch(`${TELEGRAM_API}/getWebhookInfo`);
            const info = await infoRes.json();
            webhookUrl = info?.result?.url || null;
          } catch {}

          return jsonResponse(
            {
              ok: false,
              code: "webhook_conflict",
              message: webhookUrl
                ? `Активен webhook: ${webhookUrl}`
                : "Активен webhook, установленный другим сервисом",
              hint: "Telegram не отдаёт апдейты через getUpdates, пока стоит webhook.",
            },
            409,
          );
        }

        /*
         * Лимит частоты при синхронизации — тоже 429, но здесь он означает
         * другое: слишком частые нажатия «синхронизировать». Пробрасываем
         * клиенту тот же код, чтобы интерфейс показал паузу, а не ошибку.
         */
        if (response.status === 429) {
          const retryAfter = await readRetryAfter(response);
          return jsonResponse(
            {
              ok: false,
              code: "rate_limited",
              message: "Telegram ограничил частоту запросов",
              retryAfter,
            },
            429,
          );
        }

        if (!response.ok) {
          return jsonResponse(
            {
              ok: false,
              code: "telegram_error",
              message: `Telegram error ${response.status}`,
            },
            502,
          );
        }

        const data = await response.json();
        if (!data.ok) {
          return jsonResponse(
            {
              ok: false,
              code: "telegram_error",
              message: data.description || "Telegram returned error",
            },
            502,
          );
        }

        // Первый проход: забираем сами сообщения и запоминаем, каким трекам
        // нужны настоящие значения длительности.
        const pendingDurations = [];

        for (const update of data.result) {
          lastUpdateId = Math.max(lastUpdateId, update.update_id ?? 0);
          const msg =
            update.message || update.channel_post || update.edited_channel_post;
          if (!msg) continue;

          const track = extractTrackFromMessage(msg, selfOrigin);
          if (track && !tracks.some((t) => t.id === track.id)) {
            tracks = [track, ...tracks];
            pendingDurations.push(track);
          }
        }

        /*
         * Второй проход: настоящая длительность.
         *
         * Из метаданных Telegram её взять нельзя — она приходит только с
         * `getFile`, а он ограничен 1 запросом в секунду. Поэтому дозапрашиваем
         * ОДИН РАЗ НА СИНХРОНИЗАЦИЮ, а не на каждое воспроизведение, и только
         * для новых треков. Пауза между запросами удерживает нас ниже лимита.
         *
         * `ctx.waitUntil` позволяет не заставлять клиента ждать: ссылки и так
         * рабочие, а `file_path` осядет в кэше к моменту первого включения.
         */
        if (pendingDurations.length > 0) {
          const fill = (async () => {
            for (const track of pendingDurations) {
              await resolveFilePath(env, TELEGRAM_API, track.fileId);
              await sleep(1100);
            }
          })();

          if (ctx && typeof ctx.waitUntil === "function") {
            ctx.waitUntil(fill);
          } else {
            await fill;
          }
        }

        await saveStoredData(env, tracks, lastUpdateId);
        return jsonResponse({ ok: true, tracks });
      } catch (err) {
        return jsonResponse(
          {
            ok: false,
            code: "unknown",
            message: err.message,
          },
          500,
        );
      }
    }

    // 4. Стриминг аудиофайла
    if (
      url.pathname === "/api/telegram/file" ||
      url.pathname === "/stream" ||
      url.pathname === "/api/stream"
    ) {
      const fileId =
        url.searchParams.get("fileId") || url.searchParams.get("file_id");
      if (!fileId) {
        return new Response("Missing fileId parameter", {
          status: 400,
          headers: corsHeaders(),
        });
      }

      try {
        const resolved = await resolveFilePath(env, TELEGRAM_API, fileId);

        if (resolved.rateLimited) {
          /*
           * Telegram просит подождать. Отдаём 429, а не 404.
           *
           * Это принципиально: 404 клиент считает «источник мёртв» и уходит
           * к следующему треку, который немедленно упирается в тот же лимит.
           * 429 с `Retry-After` плеер пережидает на ТЕКУЩЕМ треке.
           */
          return new Response(
            JSON.stringify({
              ok: false,
              code: "rate_limited",
              message: "Telegram rate limit on getFile",
              retryAfter: resolved.retryAfter,
            }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "Retry-After": String(resolved.retryAfter),
                ...corsHeaders(),
              },
            },
          );
        }

        if (!resolved.filePath) {
          return new Response(
            JSON.stringify({
              ok: false,
              code: "not_found",
              message: resolved.message || "Failed to resolve Telegram file",
            }),
            {
              status: 404,
              headers: { "Content-Type": "application/json", ...corsHeaders() },
            },
          );
        }

        const telegramDownloadUrl = `${TELEGRAM_FILE_API}/${resolved.filePath}`;
        const forwardHeaders = new Headers();
        if (request.headers.has("range")) {
          forwardHeaders.set("range", request.headers.get("range"));
        }

        const audioResponse = await fetch(telegramDownloadUrl, {
          headers: forwardHeaders,
        });

        const resHeaders = new Headers(audioResponse.headers);
        Object.entries(corsHeaders()).forEach(([k, v]) =>
          resHeaders.set(k, v),
        );
        resHeaders.set("Accept-Ranges", "bytes");

        return new Response(audioResponse.body, {
          status: audioResponse.status,
          headers: resHeaders,
        });
      } catch (err) {
        return new Response("Stream proxy error: " + err.message, {
          status: 500,
          headers: corsHeaders(),
        });
      }
    }

    // 5. Поиск треков через YouTube Invidious
    if (url.pathname === "/api/youtube/search") {
      const q = (url.searchParams.get("q") || "").trim();
      const mode = url.searchParams.get("mode") === "all" ? "all" : "music";

      if (!q) {
        return jsonResponse({ ok: false, message: "Missing query" }, 400);
      }

      const params = new URLSearchParams({ q, type: "video" });
      if (mode === "music") params.set("filter", "music_songs");

      const errors = [];
      for (const mirror of YOUTUBE_MIRRORS) {
        try {
          const pages = await Promise.all(
            Array.from({ length: YOUTUBE_SEARCH_PAGES }, (_, index) =>
              fetchYouTubePage(
                mirror,
                params,
                index + 1,
                YOUTUBE_MIRROR_TIMEOUT_MS,
              ).catch((e) => {
                errors.push(`${mirror}: ${e.message}`);
                return [];
              }),
            ),
          );

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

          if (items.length > 0) {
            return jsonResponse({ ok: true, items, mirror });
          }
        } catch (e) {
          errors.push(`${mirror}: ${e.message}`);
        }
      }

      return jsonResponse(
        { ok: false, message: "youtube_unreachable", details: errors },
        503,
      );
    }

    // 6. Вебхуки Telegram
    if (url.pathname === "/api/telegram/webhook/info") {
      const res = await fetch(`${TELEGRAM_API}/getWebhookInfo`);
      const data = await res.json();
      return jsonResponse({ ok: data.ok, info: data.result ?? null, publicUrl: selfOrigin });
    }

    if (url.pathname === "/api/telegram/webhook/delete" && request.method === "POST") {
      const res = await fetch(`${TELEGRAM_API}/deleteWebhook`);
      const data = await res.json();
      return jsonResponse({ ok: true, message: data.description });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders() });
  },
};

/* ───────────────────── Разрешение file_path ───────────────────── */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Достаёт `retry_after` из ответа Telegram.
 *
 * При лимите Telegram отвечает `{ ok: false, error_code: 429,
 * parameters: { retry_after: 3 } }`. Свой заголовок `Retry-After` он не
 * выставляет, поэтому значение приходится брать из тела.
 */
async function readRetryAfter(response) {
  try {
    const data = await response.clone().json();
    const value = data?.parameters?.retry_after;
    if (typeof value === "number" && value > 0) return Math.ceil(value);
  } catch {
    // Тело не JSON или уже прочитано — обойдёмся значением по умолчанию.
  }

  return DEFAULT_RETRY_AFTER_SECONDS;
}

/**
 * Возвращает `file_path` для `file_id`, по возможности из кэша KV.
 *
 * ПОЧЕМУ КЭШ ЗДЕСЬ КРИТИЧЕН
 * -------------------------
 * `getFile` разрешён не чаще 1 раза в секунду. `<audio>` на Android обращается
 * к эндпоинту несколько раз на один трек, и без кэша каждый такой запрос — это
 * отдельный вызов `getFile`. Даже при полностью исправном сервере телефон
 * упирался в лимит и не мог проиграть второй трек подряд.
 *
 * `file_path` для одного `file_id` не меняется, поэтому кэш безопасен.
 *
 * @returns {Promise<{filePath?: string, rateLimited?: boolean, retryAfter?: number, message?: string}>}
 */
async function resolveFilePath(env, telegramApi, fileId) {
  const cacheKey = `tgfile:${fileId}`;

  const cached = await kvGetJson(env, cacheKey);
  if (cached && typeof cached.filePath === "string") {
    return { filePath: cached.filePath };
  }

  const response = await fetch(
    `${telegramApi}/getFile?file_id=${encodeURIComponent(fileId)}`,
  );

  if (response.status === 429) {
    return {
      rateLimited: true,
      retryAfter: await readRetryAfter(response),
    };
  }

  if (!response.ok) {
    return { message: `Telegram getFile failed: ${response.status}` };
  }

  const data = await response.json();

  if (!data.ok) {
    /*
     * Отдельный случай: файл больше 20 МБ.
     *
     * Bot API не отдаёт такие файлы вообще — ни через getFile, ни как-либо
     * иначе, это ограничение платформы, а не сбой. Скачивать их нужно через
     * локальный Bot API server, чего у нас нет. Поэтому помечаем постоянной
     * ошибкой, повторять бессмысленно.
     */
    const description = data.description || "Telegram getFile error";
    const tooBig = /too big/i.test(description);

    return { message: description, tooBig };
  }

  const filePath = data.result?.file_path;
  if (!filePath) return { message: "Telegram returned empty file_path" };

  await kvPutJson(env, cacheKey, { filePath }, FILE_PATH_TTL_SECONDS);

  return { filePath };
}
