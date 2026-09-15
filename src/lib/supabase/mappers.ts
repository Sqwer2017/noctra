import type { PlaylistPrivacy, Playlist, PlaylistTrack } from "../../types/playlist";
import { durationToSeconds, secondsToDuration } from "../format";

/**
 * Маппинг между клиентскими типами и строками Supabase.
 *
 * Всё приведение типов живёт здесь, в одном месте: компоненты и сторы
 * продолжают работать с удобными клиентскими структурами, а БД получает
 * ровно те колонки, что описаны в миграции.
 */

// ── profiles ──────────────────────────────────────────────────────────

export type ProfileRow = {
  id: string;
  username: string | null;
  tag: string | null;
  bio: string | null;
  status: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  xp: number | null;
  level: number | null;
  rank_tier: number | null;
  rank_name: string | null;
  accent_theme: string | null;
  followers: number | null;
  following: number | null;
  daily_date: string | null;
  daily_listened_seconds: number | null;
  daily_favorites_added: number | null;
  daily_completed_tracks: number | null;
  playlist_xp_claimed: boolean | null;
};

export type ProfilePayload = {
  username: string;
  tag: string;
  bio: string;
  status: string;
  avatar_url: string | null;
  banner_url: string | null;
  xp: number;
  level: number;
  rank_tier: number;
  rank_name: string;
  accent_theme: string;
  daily_date: string;
  daily_listened_seconds: number;
  daily_favorites_added: number;
  daily_completed_tracks: number;
  playlist_xp_claimed: boolean;
};

// ── favorites / playlist_tracks (одинаковая форма трека) ───────────────

export type TrackRow = {
  track_id: string;
  title: string;
  artist: string;
  duration: number | null;
  cover_url: string | null;
  stream_url: string | null;
  source: string;
};

type TrackRowWithMeta = TrackRow & {
  id?: string;
  added_at?: string;
  order_index?: number;
};

/** Клиентский трек → колонки БД. `duration` переводим в секунды. */
export function trackToRow(track: PlaylistTrack): TrackRow {
  return {
    track_id: track.id,
    title: track.title,
    artist: track.artist,
    duration: durationToSeconds(track.duration),
    cover_url: track.coverUrl ?? null,
    stream_url: track.streamUrl ?? null,
    source: track.source,
  };
}

/** Строка БД → клиентский трек. `duration` возвращаем строкой для UI. */
export function rowToTrack(row: TrackRowWithMeta): PlaylistTrack {
  return {
    id: row.track_id,
    title: row.title,
    artist: row.artist,
    duration: secondsToDuration(row.duration ?? 0),
    coverUrl: row.cover_url ?? null,
    streamUrl: row.stream_url ?? undefined,
    source: (row.source as PlaylistTrack["source"]) ?? "Telegram",
  };
}

// ── playlists ─────────────────────────────────────────────────────────

export type PlaylistRow = {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  is_public: boolean;
  created_at?: string;
};

/** Privacy в клиенте трёхзначный, в БД — булев is_public. */
export function privacyToPublic(privacy: PlaylistPrivacy): boolean {
  return privacy === "Public";
}

export function publicToPrivacy(isPublic: boolean): PlaylistPrivacy {
  return isPublic ? "Public" : "Private";
}

export function playlistToRow(
  playlist: Omit<Playlist, "id" | "tracks"> | Playlist,
): Omit<PlaylistRow, "id" | "created_at"> {
  return {
    title: playlist.name,
    description: playlist.description || null,
    cover_url: playlist.cover ?? null,
    is_public: privacyToPublic(playlist.privacy),
  };
}

export function rowToPlaylist(
  row: PlaylistRow,
  tracks: PlaylistTrack[] = [],
): Playlist {
  return {
    id: row.id,
    name: row.title,
    description: row.description ?? "",
    cover: row.cover_url ?? null,
    privacy: publicToPrivacy(row.is_public),
    tracks,
  };
}
