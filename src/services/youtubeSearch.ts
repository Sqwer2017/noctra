import type { PlaylistTrack } from "../types/playlist";
import { youTubeCoverUrl } from "../lib/youtubeCover";
import { API_BASE_URL } from "../config/api";

/**
 * Поиск треков на YouTube.
 *
 * ПОЧЕМУ НЕ ОФИЦИАЛЬНЫЙ API
 * -------------------------
 * Google Data API даёт всего 100 поисковых запросов в сутки — на реальную
 * аудиторию этого не хватит (сто человек сделают по одному запросу, и квота
 * исчерпана до конца дня). Поэтому поиск идёт через публичные зеркала
 * Invidious: у них нет такой квоты.
 *
 * ЗЕРКАЛА НЕСТАБИЛЬНЫ
 * -------------------
 * Это ключевая особенность, к которой нужно быть готовым: публичные инстансы
 * поднимают и гасят постоянно. На момент написания из проверенных восьми
 * работали три. Поэтому:
 *   * зеркала перебираются по цепочке, пока одно не ответит;
 *   * у каждого свой таймаут — «зависшее» зеркало не должно держать запрос;
 *   * ответ проверяется на то, что это ДЕЙСТВИТЕЛЬНО JSON: часть зеркал
 *     отдаёт 200 с HTML-страницей вместо данных. Доверять одному `res.ok`
 *     здесь нельзя — именно на этом легко потерять весь поиск.
 *
 * Если не ответило ни одно зеркало — честно сообщаем об этом. Молчаливый
 * пустой результат выглядел бы как «ничего не найдено», и человек решил бы,
 * что трека нет, хотя проблема в сервисе.
 *
 * ВОСПРОИЗВЕДЕНИЕ
 * ---------------
 * Прямые аудиопотоки YouTube заблокированы, поэтому здесь нет `streamUrl`.
 * Такие треки играет скрытый IFrame-плеер (см. YouTubeBridge) по `videoId`.
 */

/**
 * Зеркала для ПРЯМОГО запроса из браузера — запасной путь.
 *
 * Сюда попадают только те, что отдают `Access-Control-Allow-Origin: *`.
 * Проверено: большинство публичных зеркал этого не делают и блокируются
 * браузером, поэтому основной путь — через наш бэкенд.
 */
const DIRECT_MIRRORS = ["https://invidious.f5.si"];

/**
 * Сколько ждать ответа от одного источника.
 *
 * 4 секунды: медленное зеркало не успеет, зато пользователь не ждёт
 * по полминуты, пока переберутся все.
 */
const MIRROR_TIMEOUT_MS = 4000;

/** Сколько результатов запрашивать. */
const SEARCH_LIMIT = 30;

/**
 * Треки такой длины и больше помечаются как «микс».
 *
 * Это не фильтр (пользователь вправе слушать часовые сеты), а подсказка:
 * в выдаче YouTube много многочасовых сборников, и по названию не всегда
 * понятно, что это не обычный трек.
 */
export const MIX_DURATION_SECONDS = 900;

/** Коды ошибок сервиса — UI переводит их в понятный текст. */
export type YouTubeSearchError = "youtube_unreachable" | "youtube_empty";

/** Ответ одного результата поиска Invidious (только нужные поля). */
type InvidiousVideo = {
  type?: string;
  videoId?: string;
  title?: string;
  author?: string;
  lengthSeconds?: number;
  liveNow?: boolean;
  isUpcoming?: boolean;
  videoThumbnails?: Array<{
    quality?: string;
    url?: string;
    width?: number;
    height?: number;
  }>;
};

/** Форматирует секунды в «м:ss» — как в остальных источниках. */
function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "0:00";

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Превращает результат Invidious в трек Noctra. */
function mapVideo(video: InvidiousVideo): PlaylistTrack | null {
  const videoId = video.videoId;

  // Без идентификатора трек бесполезен: IFrame нечего будет загружать.
  if (!videoId) return null;

  const lengthSeconds = Number(video.lengthSeconds ?? 0);

  return {
    // Префикс не даёт столкнуться с id других источников: у Audius и Telegram
    // свои пространства идентификаторов, и совпадение сломало бы избранное
    // и плейлисты.
    id: `youtube_${videoId}`,
    videoId,
    title: video.title?.trim() || "Untitled",
    artist: video.author?.trim() || "YouTube",
    source: "YouTube",
    duration: formatDuration(lengthSeconds),
    /*
     * Обложку строим сами, ответ зеркала для этого не нужен.
     *
     * Так надёжнее: ссылки зеркал ломаются вместе с зеркалами, а CDN Google
     * доступен всегда. Заодно отпадает случай, когда зеркало вернуло пустой
     * список превью — раньше карточка оставалась без картинки.
     */
    coverUrl: youTubeCoverUrl(videoId),
    /*
     * `streamUrl` намеренно не заполняем: прямые потоки YouTube недоступны,
     * и плеер определяет способ воспроизведения именно по источнику.
     */
  };
}

/**
 * Определяет, является ли ответ зеркала настоящими данными.
 *
 * Некоторые зеркала отдают 200 с HTML-страницей (заглушкой или интерфейсом
 * самого сайта). Если этого не проверить, мы попытаемся разобрать HTML как
 * JSON, получим исключение и уйдём к следующему зеркалу — то есть потратим
 * время впустую. Проверка по типу содержимого экономит попытку.
 */
function looksLikeJson(response: Response): boolean {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("json");
}

/**
 * Режим поиска.
 *
 * `music` — только треки (фильтр Invidious `music_songs`). Это режим
 * по умолчанию: в выдаче без фильтра половину занимают обзоры, влоги
 * и прочий нецелевой контент.
 *
 * `all` — все видео. Нужен для редких случаев: ремиксы, концертные записи
 * и лайвы часто не помечены как музыка, и в режиме «треки» их не найти.
 */
export type YouTubeSearchMode = "music" | "all";

/**
 * Границы «обычного трека» в режиме музыки.
 *
 * Верхняя: всё, что длиннее 20 минут, — это сборник, микс или полный концерт,
 * а не трек. Нижняя: ролики короче 30 секунд — это рекламные вставки,
 * короткие нарезки и звуковые эффекты.
 *
 * Почему это нужно, если уже есть фильтр зеркала: `filter=music_songs`
 * у Invidious только ПОВЫШАЕТ приоритет музыки, но не гарантирует чистоту
 * выдачи. На реальном запросе «metallica» из двадцати результатов двенадцать
 * оказываются не музыкой, а среди музыкальных половина — часовые сборники.
 * Фильтр зеркала убирает обзоры и влоги, отсев по длине — сборники.
 */
const TRACK_MIN_SECONDS = 30;
const TRACK_MAX_SECONDS = 20 * 60;

/** Ищет через наш бэкенд. Бросает при любой проблеме. */
async function searchViaBackend(
  query: string,
  mode: YouTubeSearchMode,
): Promise<InvidiousVideo[]> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    // Бэкенд сам перебирает зеркала, поэтому ему нужно больше времени,
    // чем одному прямому запросу.
    15_000,
  );

  try {
    const params = new URLSearchParams({ q: query, mode });
    const response = await fetch(
      `${API_BASE_URL}/api/youtube/search?${params.toString()}`,
      { signal: controller.signal, headers: { Accept: "application/json" } },
    );

    if (!response.ok) {
      throw new Error(`бэкенд ответил ${response.status}`);
    }

    const data: unknown = await response.json();
    const items = (data as { items?: unknown }).items;

    if (!Array.isArray(items)) {
      throw new Error("неожиданный формат ответа");
    }

    return items as InvidiousVideo[];
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/** Ищет напрямую через зеркало — запасной путь, если бэкенд недоступен. */
async function searchViaMirror(
  mirror: string,
  query: string,
  mode: YouTubeSearchMode,
): Promise<InvidiousVideo[]> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    MIRROR_TIMEOUT_MS,
  );

  try {
    const params = new URLSearchParams({ q: query, type: "video" });
    if (mode === "music") params.set("filter", "music_songs");

    const url = `${mirror}/api/v1/search?${params.toString()}`;

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`зеркало ответило ${response.status}`);
    }

    if (!looksLikeJson(response)) {
      throw new Error("зеркало вернуло не JSON");
    }

    const data: unknown = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("неожиданный формат ответа");
    }

    return data as InvidiousVideo[];
  } finally {
    window.clearTimeout(timeoutId);
  }
}

/** Отсеивает то, что не является треком, и превращает в треки Noctra. */
function toTracks(
  videos: InvidiousVideo[],
  mode: YouTubeSearchMode,
): PlaylistTrack[] {
  /*
   *  - живые трансляции и премьеры нельзя перемотать, и у них нет нормальной
   *    длины — они сломали бы и таймлайн, и подсчёт прогресса;
   *  - записи без идентификатора уже отсеяны в mapVideo.
   *
   * В режиме «треки» дополнительно ограничиваем длительность: без этого
   * в выдаче оказываются многочасовые сборники, которые формально проходят
   * фильтр зеркала, но треками не являются. В режиме «все видео» границы
   * не применяем — там пользователь ищет именно концерты и длинные миксы.
   */
  const candidates = videos.filter((video) => {
    if (video.liveNow || video.isUpcoming) return false;

    if (mode === "music") {
      const seconds = Number(video.lengthSeconds ?? 0);
      if (seconds < TRACK_MIN_SECONDS) return false;
      if (seconds > TRACK_MAX_SECONDS) return false;
    }

    return true;
  });

  return candidates
    .slice(0, SEARCH_LIMIT)
    .map(mapVideo)
    .filter((track): track is PlaylistTrack => track !== null);
}

/**
 * Ищет треки на YouTube.
 *
 * Сначала через наш бэкенд — он не знает ограничений CORS и сам перебирает
 * зеркала. Если бэкенд недоступен (например, бесплатный тариф просыпается
 * после простоя), пробуем напрямую те зеркала, что разрешают чужие домены.
 *
 * @param query Поисковый запрос. Пустой игнорируется — возвращаем пустой массив.
 * @param mode  Режим: только музыка или все видео.
 * @throws Error с кодом `youtube_unreachable`, если поиск не удался нигде.
 */
export async function searchYouTube(
  query: string,
  mode: YouTubeSearchMode = "music",
): Promise<PlaylistTrack[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // ── Основной путь: через бэкенд ──────────────────────────────────────
  try {
    const videos = await searchViaBackend(trimmed, mode);
    const tracks = toTracks(videos, mode);

    /*
     * Пустой результат не считаем сбоем: поиск мог честно ничего не найти.
     * Но тогда пробуем напрямую — у другого зеркала выдача может отличаться.
     */
    if (tracks.length > 0) return tracks;
  } catch (error) {
    console.warn(
      "[youtube] поиск через бэкенд не удался:",
      error instanceof Error ? error.message : error,
    );
  }

  // ── Запасной путь: напрямую в зеркало ────────────────────────────────
  for (const mirror of DIRECT_MIRRORS) {
    try {
      const videos = await searchViaMirror(mirror, trimmed, mode);
      const tracks = toTracks(videos, mode);

      if (tracks.length > 0) return tracks;
    } catch (error) {
      console.warn(
        `[youtube] зеркало ${mirror} не ответило:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  throw new Error("youtube_unreachable");
}
