import type { PlaylistTrack } from "../types/playlist";

/**
 * Поиск и стриминг треков через открытый API Audius.
 * Не требует приватных токенов и работает прямо в браузере.
 *
 * Нода выбирается автоматически: сначала спрашиваем список discovery-нод
 * (api.audius.co), берём первую доступную; при неудаче — фолбэк на
 * discoveryprovider.audius.co. Выбор кэшируется на время сессии.
 */

const APP_NAME = "NOCTRA_APP";
const FALLBACK_NODE = "https://discoveryprovider.audius.co";

let cachedNode: string | null = null;
let nodePromise: Promise<string> | null = null;

type AudiusRawTrack = {
  id: string;
  title: string;
  duration: number;
  user?: { name?: string };
  artwork?: { "480x480"?: string; "150x150"?: string };
};

async function resolveNode(): Promise<string> {
  if (cachedNode) return cachedNode;
  if (nodePromise) return nodePromise;

  nodePromise = (async () => {
    try {
      const res = await fetch("https://api.audius.co");
      if (res.ok) {
        const data = (await res.json()) as { data?: string[] };
        const first = data.data?.[0];
        if (first) {
          cachedNode = first.replace(/\/$/, "");
          return cachedNode;
        }
      }
    } catch {
      // игнорируем — уйдём на фолбэк
    }

    cachedNode = FALLBACK_NODE;
    return cachedNode;
  })();

  try {
    return await nodePromise;
  } finally {
    nodePromise = null;
  }
}

function secondsToDuration(seconds: number): string {
  if (!seconds || Number.isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function mapTrack(raw: AudiusRawTrack): PlaylistTrack {
  return {
    id: `audius_${raw.id}`,
    title: raw.title || "Untitled",
    artist: raw.user?.name || "Unknown Artist",
    source: "Audius",
    duration: secondsToDuration(raw.duration),
    coverUrl:
      raw.artwork?.["480x480"] ?? raw.artwork?.["150x150"] ?? null,
    // Прямой аудио-стрим для HTML5 Audio (нода подставляется при запросе).
    streamUrl: "",
    fileId: raw.id,
  };
}

/**
 * Ищет треки в Audius. Возвращает готовые PlaylistTrack со streamUrl.
 * Бросает ошибку при недоступности API — UI показывает понятное сообщение.
 */
export async function searchAudiusTracks(
  query: string,
  limit = 20,
): Promise<PlaylistTrack[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const node = await resolveNode();

  let res: Response;
  try {
    res = await fetch(
      `${node}/v1/tracks/search?query=${encodeURIComponent(trimmed)}&app_name=${APP_NAME}`,
    );
  } catch {
    throw new Error("audius_unreachable");
  }

  if (!res.ok) {
    throw new Error("audius_error");
  }

  const data = (await res.json()) as { data?: AudiusRawTrack[] };

  return (data.data ?? []).slice(0, limit).map((raw) => ({
    ...mapTrack(raw),
    streamUrl: `${node}/v1/tracks/${raw.id}/stream?app_name=${APP_NAME}`,
  }));
}
