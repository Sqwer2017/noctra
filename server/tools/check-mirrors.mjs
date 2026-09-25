/**
 * Проверка зеркал: какие реально отдают пригодный аудиопоток.
 *
 * ЗАЧЕМ ОТДЕЛЬНЫЙ СКРИПТ
 * ----------------------
 * Список публичных зеркал меняется каждые несколько недель: одни умирают,
 * другие появляются. Держать в конфиге адреса «по памяти» бессмысленно —
 * их нужно периодически прогонять и смотреть, что живо сейчас.
 *
 * Скрипт проверяет каждое зеркало по трём критериям, и все три обязательны:
 *
 *   1. Отвечает ли на /streams/:id (иначе брать нечего).
 *   2. Есть ли в ответе пригодный поток (аудио или муксированный mp4).
 *   3. Отдаёт ли этот поток байты С ПОДДЕРЖКОЙ ДИАПАЗОНОВ — то есть
 *      возвращает 206 и КОРРЕКТНЫЙ Content-Range.
 *
 * Третий пункт самый важный и самый коварный. Зеркало может отдать ссылку,
 * которая прекрасно работает без Range, но на запрос из середины отвечает
 * мусором вида `bytes 1048576-1048575/1048576` — конец меньше начала.
 * Для плеера это означает сломанную перемотку и обрыв воспроизведения.
 *
 * Запуск: node tools/check-mirrors.mjs
 */

/** Кандидаты в пул. Проверяются все, прошедшие попадают в отчёт. */
const CANDIDATES = [
  "https://pipedapi.ducks.party",
  "https://api.piped.private.coffee",
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.privacy.com.de",
  "https://piped-api.garudalinux.org",
  "https://pipedapi.reallyaweso.me",
  "https://pipedapi.drgns.space",
  "https://pipedapi.orangenet.cc",
  "https://pipedapi.leptons.xyz",
  "https://pipedapi.nosebs.ru",
  "https://piapi.ggtyler.dev",
  "https://pipedapi.astartes.nl",
  "https://api.piped.yt",
  "https://pipedapi.smnz.de",
];

/** Тестовое видео: короткое, общедоступное, без ограничений. */
const TEST_VIDEO_ID = "dQw4w9WgXcQ";

/** Сколько ждать ответа от зеркала. */
const TIMEOUT_MS = 12000;

/** Запрос с таймаутом. */
async function fetchWithTimeout(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Разбирает Content-Range и проверяет его корректность.
 *
 * Формат: `bytes НАЧАЛО-КОНЕЦ/ВСЕГО`. Признак поломки — конец меньше начала
 * или неверный общий размер. Именно так отвечает прокси нерабочих зеркал.
 *
 * @returns Объект с полями или `null`, если заголовок неразбираем.
 */
function parseContentRange(value) {
  if (typeof value !== "string") return null;

  const match = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(value.trim());
  if (!match) return null;

  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = match[3] === "*" ? null : Number(match[3]);

  // Главная проверка: конец не может быть меньше начала.
  const isValid = end >= start && start >= 0 && (total === null || total > end);

  return { start, end, total, isValid };
}

/**
 * Выбирает лучший пригодный поток из ответа зеркала.
 *
 * Приоритет:
 *   1. Чистое аудио (audio/mp4, затем audio/webm) — меньше трафика.
 *   2. Муксированный mp4 без разделения (`videoOnly: false`) — в нём есть
 *      звук, а для `<audio>` лишнее видео просто игнорируется.
 *
 * HLS (`application/x-mpegurl`) отбрасываем: это плейлист, а не файл,
 * в `<audio>` он не откроется.
 *
 * @returns `{ url, mimeType, kind }` или `null`.
 */
function pickStream(data) {
  const audioStreams = Array.isArray(data?.audioStreams) ? data.audioStreams : [];
  const videoStreams = Array.isArray(data?.videoStreams) ? data.videoStreams : [];

  const usableAudio = audioStreams.filter(
    (s) =>
      typeof s?.url === "string" &&
      /^audio\/(mp4|webm)/.test(String(s.mimeType ?? "")),
  );

  if (usableAudio.length > 0) {
    /*
     * Сортируем по битрейту от высокого к низкому: качество звука важнее
     * экономии трафика, а разница в размере для аудио невелика.
     */
    const sorted = [...usableAudio].sort(
      (a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0),
    );

    const m4a = sorted.find((s) => String(s.mimeType).includes("audio/mp4"));
    const chosen = m4a ?? sorted[0];

    return {
      url: chosen.url,
      mimeType: chosen.mimeType,
      kind: "audio",
    };
  }

  const usableMuxed = videoStreams.filter(
    (s) =>
      typeof s?.url === "string" &&
      s?.videoOnly === false &&
      String(s?.mimeType ?? "").startsWith("video/mp4"),
  );

  if (usableMuxed.length === 0) return null;

  /*
   * Предпочитаем ссылки через прокси самого зеркала: прямые адреса внешних
   * CDN часто отдают 401 без специальных заголовков.
   */
  const viaProxy = usableMuxed.filter((s) => String(s.url).includes("piped-proxy"));
  const chosen = (viaProxy.length > 0 ? viaProxy : usableMuxed)[0];

  return {
    url: chosen.url,
    mimeType: "audio/mp4",
    kind: "muxed",
  };
}

/** Проверяет одно зеркало целиком. */
async function checkMirror(mirror) {
  const result = { mirror, ok: false, stage: "запрос", detail: "" };

  try {
    const response = await fetchWithTimeout(`${mirror}/streams/${TEST_VIDEO_ID}`, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      result.detail = `HTTP ${response.status}`;
      return result;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) {
      result.detail = "не JSON";
      return result;
    }

    const data = await response.json();

    if (data?.error) {
      result.detail = String(data.error).slice(0, 60);
      return result;
    }

    result.stage = "поток";

    const stream = pickStream(data);
    if (!stream) {
      const audioCount = Array.isArray(data?.audioStreams)
        ? data.audioStreams.length
        : 0;
      const videoCount = Array.isArray(data?.videoStreams)
        ? data.videoStreams.length
        : 0;
      result.detail = `нет потока (audio=${audioCount}, video=${videoCount})`;
      return result;
    }

    result.stage = "диапазоны";

    /*
     * Проверяем перемотку. Запрашиваем байт из СЕРЕДИНЫ файла: именно там
     * ломаются прокси нерабочих зеркал.
     */
    const probe = await fetchWithTimeout(stream.url, {
      headers: { Range: "bytes=1000000-1001023" },
    });

    if (probe.status !== 206) {
      result.detail = `диапазон вернул ${probe.status}, нужен 206`;
      if (probe.body) await probe.body.cancel();
      return result;
    }

    const range = parseContentRange(probe.headers.get("content-range"));

    if (probe.body) await probe.body.cancel();

    if (!range) {
      result.detail = "Content-Range неразбираем";
      return result;
    }

    if (!range.isValid) {
      result.detail = `сломанный Content-Range (${range.start}-${range.end})`;
      return result;
    }

    const cors = probe.headers.get("access-control-allow-origin");

    result.ok = true;
    result.kind = stream.kind;
    result.mimeType = stream.mimeType;
    result.cors = cors ?? "нет";
    result.totalMb = range.total ? (range.total / 1048576).toFixed(1) : "?";
    result.detail = `${stream.kind} ${stream.mimeType.split(";")[0]}, ${result.totalMb} МБ`;

    return result;
  } catch (error) {
    result.detail =
      error instanceof Error
        ? error.name === "AbortError"
          ? "таймаут"
          : error.message.slice(0, 60)
        : "ошибка";
    return result;
  }
}

console.log(`Проверяю ${CANDIDATES.length} зеркал на видео ${TEST_VIDEO_ID}\n`);
console.log("Требования: ответ JSON → есть поток → Range отдаёт 206 с валидным Content-Range\n");

const results = [];

for (const mirror of CANDIDATES) {
  const result = await checkMirror(mirror);
  results.push(result);

  const mark = result.ok ? "РАБОТАЕТ" : `нет (${result.stage})`;
  const host = mirror.replace("https://", "");

  console.log(`${mark.padEnd(18)} ${host.padEnd(34)} ${result.detail}`);

  if (result.ok) {
    console.log(`                   CORS: ${result.cors}`);
  }
}

const working = results.filter((r) => r.ok);

console.log("\n" + "=".repeat(70));
console.log(`Итог: рабочих ${working.length} из ${results.length}`);

if (working.length > 0) {
  console.log("\nДля конфига (в порядке приоритета):\n");
  for (const r of working) {
    console.log(`  "${r.mirror}",`);
  }
} else {
  console.log(
    "\nНи одно зеркало не отдало пригодный поток. Нужны новые кандидаты.",
  );
}
