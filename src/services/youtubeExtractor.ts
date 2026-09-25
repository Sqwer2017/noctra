import { Capacitor, CapacitorHttp } from "@capacitor/core";

/**
 * Извлечение аудиопотока YouTube НА УСТРОЙСТВЕ.
 *
 * ЗАЧЕМ ЭТО НУЖНО
 * ---------------
 * Треки YouTube единственные играли через встроенный плеер YouTube (IFrame).
 * На Android это означает, что при блокировке экрана система глушит
 * видеодекодеры и останавливает звук — фоновая музыка с YouTube была
 * невозможна в принципе.
 *
 * Чтобы играть их тем же `<audio>`, что и Telegram-треки, нужен прямой
 * адрес аудиопотока. Получить его с нашего сервера не выходит: YouTube
 * блокирует анонимные запросы с серверных IP (403 на любой формат).
 *
 * Зато это работает С САМОГО УСТРОЙСТВА, и вот почему.
 *
 * КАК ЭТО РАБОТАЕТ
 * ----------------
 * 1. Запрос уходит на официальный InnerTube API YouTube — тот же, что
 *    использует мобильное приложение. Указываем клиента `IOS`: он отдаёт
 *    ссылки на поток В ГОТОВОМ ВИДЕ, без шифрования подписи. Другие клиенты
 *    возвращают зашифрованную ссылку, для расшифровки которой нужен
 *    JavaScript-движок, — на устройстве его нет.
 *
 * 2. Запрос выполняется через `CapacitorHttp`, то есть СИЛАМИ ANDROID,
 *    а не страницы. Это принципиально: у ссылок `googlevideo.com` нет
 *    заголовка `Access-Control-Allow-Origin`, и обычный `fetch` из WebView
 *    такой ответ блокирует. Нативный слой правил CORS не знает.
 *
 * 3. Полученную ссылку ПРОВЕРЯЕМ пробным запросом байтов из середины файла.
 *    Это обязательно: часть роликов YouTube отдаёт анонимному клиенту
 *    только начало, отвечая на запрос из середины ошибкой 403. Без проверки
 *    такие треки молча не заиграли бы или обрывались при перемотке.
 *
 * 4. Если проверка прошла — адрес отдаётся в обычный `<audio>`, и трек
 *    играет в фоне наравне с остальными. Если нет — плеер откатывается
 *    на встроенный проигрыватель, чтобы трек всё же звучал на открытом экране.
 */

/** Версия клиента InnerTube: чем свежее, тем стабильнее выдача. */
const IOS_CLIENT_VERSION = "20.10.4";

/**
 * Идентификатор клиента в терминах InnerTube.
 *
 * `5` — это IOS. Именно он возвращает готовые ссылки: у ANDROID они
 * зашифрованы и без JS-движка бесполезны.
 */
const IOS_CLIENT_ID = "5";

/** Сколько ждать ответа InnerTube. */
const RESOLVE_TIMEOUT_MS = 15000;

/** Сколько ждать проверки ссылки. */
const PROBE_TIMEOUT_MS = 8000;

/**
 * Дальний предел проверки — для больших файлов.
 *
 * Смысл пробы: убедиться, что ссылка отдаёт НЕ ТОЛЬКО начало. Одного
 * запроса первых байтов мало — начало отдают почти все ссылки, даже те,
 * что закрыты для полного доступа.
 */
const PROBE_FAR_RANGE = "bytes=2000000-2001023";

/**
 * Ближний предел — для маленьких файлов.
 *
 * У аудио бывают разные размеры: `itag=139` весит около 1.2 МБ, `itag=140` —
 * около 3.3 МБ. Запрос на 2 МБ у файла в 1.2 МБ возвращает `416`
 * (Range Not Satisfiable) — это НЕ признак поломки ссылки, просто запрошено
 * больше, чем есть.
 *
 * Поэтому если дальний предел не подошёл по размеру, проверяем ближний:
 * он укладывается в файл любого размера.
 */
const PROBE_NEAR_RANGE = "bytes=524288-525311";


/** Пригодный для `<audio>` аудиоформат. */
export type YouTubeAudioStream = {
  /** Прямой адрес потока на googlevideo. */
  url: string;
  /** Тип содержимого (audio/mp4 и подобные). */
  mimeType: string;
  /** Битрейт в битах в секунду — для выбора лучшего качества. */
  bitrate: number;
};

/**
 * Формат потока в ответе InnerTube.
 *
 * Описаны только используемые поля: ответ содержит десятки других,
 * и держать их в типах незачем.
 */
type InnertubeFormat = {
  itag?: number;
  url?: string;
  mimeType?: string;
  bitrate?: number;
  audioQuality?: string;
  contentLength?: string;
};

type InnertubeResponse = {
  streamingData?: {
    adaptiveFormats?: InnertubeFormat[];
    formats?: InnertubeFormat[];
  };
  playabilityStatus?: {
    status?: string;
    reason?: string;
  };
};

/**
 * Выполняет запрос к YouTube.
 *
 * НА УСТРОЙСТВЕ идёт через нативный слой Android (`CapacitorHttp`), где нет
 * ограничений CORS. В браузере используется обычный `fetch` — там ссылки
 * `googlevideo` всё равно будут заблокированы, поэтому резолвер и вызывается
 * только на нативной платформе (см. `canResolveNatively`).
 */
async function requestInnertube(
  videoId: string,
  signal?: AbortSignal,
): Promise<InnertubeResponse> {
  const url = "https://www.youtube.com/youtubei/v1/player?key=AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w";

  const body = {
    videoId,
    context: {
      client: {
        clientName: "IOS",
        clientVersion: IOS_CLIENT_VERSION,
        clientNameId: IOS_CLIENT_ID,
        // Без этих полей ответ приходит урезанным.
        deviceMake: "Apple",
        deviceModel: "iPhone16,2",
        osName: "iPhone",
        osVersion: "18.3.1.22D72",
        hl: "en",
        timeZone: "UTC",
        utcOffsetMinutes: 0,
      },
    },
    /*
     * `contentCheckOk` и `racyCheckOk` снимают часть проверок контента.
     * Для музыкальных треков это безопасно, а отказов становится меньше.
     */
    contentCheckOk: true,
    racyCheckOk: true,
  };

  /*
   * Нативная платформа: запрос делает Android.
   *
   * Таймаут ставим свой: у `CapacitorHttp` есть собственный, но он не
   * связан с нашим сигналом отмены, а отмена нужна — человек может
   * переключить трек, не дождавшись ответа.
   */
  if (Capacitor.isNativePlatform()) {
    console.log("[YT] InnerTube через CapacitorHttp (нативный слой)…");

    let response;

    try {
      response = await CapacitorHttp.post({
        url,
        headers: {
          "Content-Type": "application/json",
          // Заголовки мобильного клиента: YouTube сверяет их с телом запроса.
          "User-Agent": `com.google.ios.youtube/${IOS_CLIENT_VERSION} (iPhone16,2; U; CPU iOS 18_3_1 like Mac OS X)`,
          "X-Youtube-Client-Name": IOS_CLIENT_ID,
          "X-Youtube-Client-Version": IOS_CLIENT_VERSION,
          "Accept-Language": "en-US,en;q=0.9",
        },
        data: body,
        connectTimeout: RESOLVE_TIMEOUT_MS,
        readTimeout: RESOLVE_TIMEOUT_MS,
      });
    } catch (requestError) {
      /*
       * Сбой на уровне нативного запроса: нет сети, неверный адрес,
       * ошибка плагина. Логируем отдельно от HTTP-ошибок — причины разные.
       */
      console.error(
        "[YT] CapacitorHttp не смог выполнить запрос:",
        requestError instanceof Error ? requestError.message : requestError,
      );

      throw requestError;
    }

    console.log(
      `[YT] HTTP ${response.status} | тип ответа: ${typeof response.data}`,
    );

    if (response.status !== 200) {
      /*
       * Показываем начало тела: InnerTube кладёт туда причину отказа,
       * и без этого непонятно, что именно не так с запросом.
       */
      console.warn(
        "[YT] тело ответа:",
        typeof response.data === "string"
          ? response.data.slice(0, 300)
          : JSON.stringify(response.data).slice(0, 300),
      );

      throw new Error(`InnerTube ответил ${response.status}`);
    }

    /*
     * `CapacitorHttp` разбирает JSON сам, но при неожиданном типе контента
     * может вернуть строку. Разбираем вручную, чтобы не гадать.
     */
    if (typeof response.data === "string") {
      console.log("[YT] ответ пришёл строкой — разбираю JSON вручную");

      return JSON.parse(response.data) as InnertubeResponse;
    }

    return response.data as InnertubeResponse;
  }

  // Веб-путь: используется только для отладки в браузере.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: signal
        ? AbortSignal.any([signal, controller.signal])
        : controller.signal,
    });

    if (!response.ok) {
      throw new Error(`InnerTube ответил ${response.status}`);
    }

    return (await response.json()) as InnertubeResponse;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Выбирает лучший пригодный аудиоформат.
 *
 * Приоритет — `audio/mp4` (itag 140 и подобные): этот контейнер понимают все
 * браузеры и Android WebView. Форматы `audio/webm` оставлены запасным
 * вариантом, но берём их только если mp4 нет вовсе.
 *
 * Внутри одного контейнера выбираем максимальный битрейт: разница в размере
 * для аудио невелика, а качество заметно.
 *
 * ВАЖНО ПРО РАЗМЕР
 * ----------------
 * Дорожки сильно различаются по объёму: `itag=139` около 1.2 МБ, `itag=140` —
 * около 3.3 МБ. Выбор влияет не только на качество, но и на то, поместится ли
 * запрошенный для проверки диапазон внутрь файла. Поэтому показываем размер
 * в логе — по нему сразу видно, что именно выбрано.
 */
function pickAudioFormat(
  formats: InnertubeFormat[],
): InnertubeFormat | null {
  const audio = formats.filter(
    (format) =>
      typeof format.url === "string" &&
      format.url.length > 0 &&
      String(format.mimeType ?? "").startsWith("audio/"),
  );

  if (audio.length === 0) return null;

  /*
   * Показываем все кандидаты: без этого не понять, почему выбран
   * именно этот формат и откуда взялся неожиданный размер файла.
   */
  console.log(
    "[YT] аудио-кандидаты:",
    audio
      .map(
        (f) =>
          `itag=${f.itag} ${String(f.mimeType).split(";")[0]} ` +
          `${(Number(f.bitrate) / 1000).toFixed(0)}кбит/с`,
      )
      .join(" | "),
  );

  const mp4 = audio.filter((format) =>
    String(format.mimeType ?? "").includes("audio/mp4"),
  );

  const candidates = mp4.length > 0 ? mp4 : audio;

  return candidates.reduce((best, current) =>
    (Number(current.bitrate) || 0) > (Number(best.bitrate) || 0) ? current : best,
  );
}

/**
 * Проверяет, что по ссылке реально читается середина файла.
 *
 * ЗАЧЕМ ПРОВЕРЯТЬ
 * ---------------
 * YouTube отдаёт ссылку даже на те ролики, которые анонимному клиенту
 * доступны лишь частично. Такая ссылка успешно отдаёт начало файла
 * и отвечает `403` на запрос из середины — то есть трек заиграет, но
 * оборвётся или сломается при перемотке.
 *
 * Замеры на живых треках: из пяти проверенных роликов полный доступ
 * получил только один. Без этой проверки четыре из пяти молча не играли бы.
 *
 * @returns `true`, если ссылка отдаёт `206` с корректным диапазоном.
 */
/**
 * Делает один пробный запрос диапазона.
 *
 * @returns Код ответа и заголовок `Content-Range` (если он есть).
 */
async function requestRange(
  url: string,
  range: string,
): Promise<{ status: number; contentRange: string | null }> {
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({
      url,
      headers: { Range: range },
      connectTimeout: PROBE_TIMEOUT_MS,
      readTimeout: PROBE_TIMEOUT_MS,
    });

    const headers = response.headers ?? {};

    return {
      status: response.status,
      contentRange:
        headers["Content-Range"] ?? headers["content-range"] ?? null,
    };
  }

  const response = await fetch(url, { headers: { Range: range } });

  // Тело не нужно: проверяем только заголовки, но поток надо закрыть.
  if (response.body) {
    try {
      await response.body.cancel();
    } catch {
      // Поток уже закрыт — не ошибка.
    }
  }

  return {
    status: response.status,
    contentRange: response.headers.get("content-range"),
  };
}

/**
 * Проверяет, что по ссылке реально читается не только начало файла.
 *
 * ЗАЧЕМ ПРОВЕРЯТЬ
 * ---------------
 * YouTube отдаёт ссылку даже на те ролики, которые анонимному клиенту
 * доступны лишь частично. Такая ссылка успешно отдаёт первые байты
 * и отвечает `403` на запрос дальше начала — то есть трек заиграет,
 * но оборвётся или сломается при перемотке.
 *
 * КАК ПРОВЕРЯЕМ
 * -------------
 * Сначала пробуем дальний предел (2 МБ). Если сервер ответил `206` — ссылка
 * полностью поддерживает диапазоны, это лучший случай.
 *
 * Если пришёл `416` — значит файл меньше 2 МБ. Это НЕ поломка: просто
 * запрошено больше, чем есть. Тогда проверяем ближний предел (512 КБ),
 * который укладывается в файл любого размера. Жёстко привязываться
 * к одному значению нельзя: размеры аудиодорожек различаются втрое.
 *
 * `403` на любом из пределов означает, что ссылка ограничена — её нельзя
 * использовать для полноценного воспроизведения.
 *
 * @returns `true`, если ссылка отдаёт `206` хотя бы на одном пределе.
 */
async function probeStreamUrl(url: string): Promise<boolean> {
  try {
    console.log("[YT] проба: дальний предел", PROBE_FAR_RANGE);

    const far = await requestRange(url, PROBE_FAR_RANGE);

    console.log(
      `[YT] проба: HTTP ${far.status}` +
        (far.contentRange ? ` | ${far.contentRange}` : ""),
    );

    if (far.status === 206) return true;

    /*
     * `416` — файл короче запрошенного диапазона. Пробуем ближе к началу.
     * Любой другой код (403, 404) означает реальную проблему: повторять
     * с другим диапазоном бессмысленно.
     */
    if (far.status === 416) {
      console.log(
        "[YT] файл меньше 2 МБ — проверяю ближний предел",
        PROBE_NEAR_RANGE,
      );

      const near = await requestRange(url, PROBE_NEAR_RANGE);

      console.log(
        `[YT] проба (ближняя): HTTP ${near.status}` +
          (near.contentRange ? ` | ${near.contentRange}` : ""),
      );

      return near.status === 206;
    }

    console.warn("[YT] проба: ссылка не поддерживает диапазоны");
    return false;
  } catch (error) {
    console.warn(
      "[YT] проба не удалась:",
      error instanceof Error ? error.message : error,
    );

    return false;
  }
}

/**
 * Доступен ли нативный резолвер на этом устройстве.
 *
 * В браузере смысла нет: ссылки `googlevideo` блокируются политикой CORS,
 * и запрос не пройдёт. Там YouTube по-прежнему играет через встроенный
 * проигрыватель.
 */
export function canResolveNatively(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Получает прямой адрес аудиопотока YouTube.
 *
 * @param videoId Идентификатор видео.
 * @param signal Сигнал отмены — чтобы не ждать ответа, если человек уже
 *        переключил трек.
 * @returns Поток или `null`, если получить не удалось. `null` означает
 *          «нужен запасной путь»: плеер переключится на встроенный
 *          проигрыватель, и трек всё равно зазвучит.
 */
export async function resolveYouTubeAudio(
  videoId: string,
  signal?: AbortSignal,
): Promise<YouTubeAudioStream | null> {
  console.log("[YT] resolveYouTubeAudio вызван:", videoId);

  if (!videoId) {
    console.warn("[YT] пустой videoId — выходим");
    return null;
  }

  if (!Capacitor.isNativePlatform()) {
    /*
     * В браузере резолвер бесполезен: CORS не даст прочитать поток.
     * Логируем это явно — иначе непонятно, почему функция «молчит».
     */
    console.log(
      "[YT] платформа не нативная — резолвер пропущен " +
        `(platform: ${Capacitor.getPlatform()})`,
    );
    return null;
  }

  try {
    console.log("[YT] запрашиваю InnerTube…");
    const startedAt = Date.now();

    const data = await requestInnertube(videoId, signal);

    console.log(
      `[YT] ответ InnerTube за ${Date.now() - startedAt} мс | ` +
        `status: ${data.playabilityStatus?.status ?? "нет"}`,
    );

    /*
     * Проверяем статус воспроизведения.
     *
     * `UNPLAYABLE` и `LOGIN_REQUIRED` означают, что ролик закрыт: например,
     * требует подписки или недоступен в регионе. Получить поток нельзя,
     * и это не сбой сети — повторять бессмысленно.
     */
    const status = data.playabilityStatus?.status;

    if (status && status !== "OK") {
      console.warn(
        `[YT] видео недоступно (${status}):`,
        data.playabilityStatus?.reason ?? "",
      );

      return null;
    }

    const formats = [
      ...(data.streamingData?.adaptiveFormats ?? []),
      ...(data.streamingData?.formats ?? []),
    ];

    const audioCount = formats.filter((f) =>
      String(f.mimeType ?? "").startsWith("audio/"),
    ).length;

    console.log(
      `[YT] форматов всего: ${formats.length}, из них аудио: ${audioCount}`,
    );

    const format = pickAudioFormat(formats);

    if (!format?.url) {
      console.warn("[YT] пригодный аудиоформат не найден");
      return null;
    }

    console.log(
      `[YT] выбран itag=${format.itag} ${String(format.mimeType).split(";")[0]} ` +
        `bitrate=${format.bitrate}`,
    );

    /*
     * Ссылку обязательно проверяем перед использованием: часть роликов
     * отдаёт только начало файла.
     */
    console.log("[YT] проверяю ссылку (чтение из середины)…");

    const isUsable = await probeStreamUrl(format.url);

    if (!isUsable) {
      console.warn(
        "[YT] ссылка не прошла проверку (доступно только начало) — " +
          "переключаемся на встроенный проигрыватель",
      );

      return null;
    }

    console.log("[YT] ✓ ссылка прошла проверку — играем через <audio>");

    return {
      url: format.url,
      mimeType: format.mimeType ?? "audio/mp4",
      bitrate: Number(format.bitrate) || 0,
    };
  } catch (error) {
    console.warn(
      "[youtube] не удалось получить поток:",
      error instanceof Error ? error.message : error,
    );

    return null;
  }
}
