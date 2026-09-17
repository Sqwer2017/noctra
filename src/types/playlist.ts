export type PlaylistPrivacy = "Public" | "Friends" | "Private";

/** Откуда взят трек. От источника зависит способ воспроизведения. */
export type TrackSource =
  | "SoundCloud"
  | "Audius"
  | "Telegram Test"
  | "Telegram"
  | "YouTube";

export type PlaylistTrack = {
  id: string;
  title: string;
  artist: string;
  source: TrackSource;
  duration: string;
  fileId?: string;
  streamUrl?: string;
  thumbnailFileId?: string | null;
  coverUrl?: string | null;
  /**
   * Идентификатор видео на YouTube.
   *
   * Нужен только для источника `YouTube`: такие треки не играют через
   * `<audio>` — прямой поток заблокирован, и воспроизведение идёт через
   * IFrame-плеер, которому нужен именно id видео.
   */
  videoId?: string;
};

/**
 * Играет ли трек через встроенный YouTube-плеер, а не через `<audio>`.
 *
 * Проверка по одному месту, потому что от неё зависит управление плеером
 * целиком: и запуск, и пауза, и перемотка, и получение позиции идут разными
 * путями для YouTube и для остальных источников.
 */
export function isYouTubeTrack(
  track: PlaylistTrack | null | undefined,
): boolean {
  return Boolean(track?.source === "YouTube" && track.videoId);
}

export type Playlist = {
  id: string;
  name: string;
  description: string;
  cover: string | null;
  privacy: PlaylistPrivacy;
  tracks: PlaylistTrack[];
};