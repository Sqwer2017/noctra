import { supabase, requireSupabase, isSupabaseConfigured } from "../supabase";
import type { UserProfile, UserProfileInput } from "../../types/profile";
import { nickToHandle } from "../profile";
import type { ProfileRepository } from "../profile";
import type { ProfileRow, ProfilePayload } from "./mappers";
import { syncWrite } from "./sync";
import { getLevelByXp, getRankByXp } from "../ranks";

/**
 * Supabase-адаптер профиля.
 *
 * Реализует тот же интерфейс `ProfileRepository`, что и localStorage-версия,
 * поэтому UI и сторы о подмене не знают. Имена колонок отличаются от
 * клиентских полей — вся трансляция собрана в двух функциях ниже.
 */

function rowToProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    nick: row.username ?? "listener",
    handle: row.tag ?? nickToHandle(row.username ?? "listener"),
    status: row.status ?? "",
    bio: row.bio ?? "",
    rank: row.rank_name ?? "Новичок",
    avatarUrl: row.avatar_url,
    coverUrl: row.banner_url,
    followers: row.followers ?? 0,
    following: row.following ?? 0,
  };
}

/** Клиентские поля профиля → колонки БД (без прогрессии и счётчиков). */
function profileInputToRow(input: UserProfileInput): Partial<ProfileRow> {
  const row: Partial<ProfileRow> = {};

  if (input.nick !== undefined) row.username = input.nick;
  if (input.handle !== undefined) row.tag = input.handle;
  if (input.status !== undefined) row.status = input.status;
  if (input.bio !== undefined) row.bio = input.bio;
  if (input.avatarUrl !== undefined) row.avatar_url = input.avatarUrl;
  if (input.coverUrl !== undefined) row.banner_url = input.coverUrl;
  if (input.rank !== undefined) row.rank_name = input.rank;

  return row;
}

export class SupabaseProfileRepository implements ProfileRepository {
  async getByUserId(userId: string): Promise<UserProfile | null> {
    const client = requireSupabase();

    const { data, error } = await client
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle<ProfileRow>();

    if (error) throw error;
    return data ? rowToProfile(data) : null;
  }

  async create(data: {
    userId: string;
    nick: string;
    rest?: Partial<UserProfile>;
  }): Promise<UserProfile> {
    const client = requireSupabase();

    const payload: ProfilePayload = {
      username: data.nick.trim(),
      tag: nickToHandle(data.nick),
      bio: data.rest?.bio ?? "",
      status: data.rest?.status ?? "",
      avatar_url: data.rest?.avatarUrl ?? null,
      banner_url: data.rest?.coverUrl ?? null,
      xp: 0,
      level: 1,
      rank_tier: 1,
      rank_name: data.rest?.rank ?? "Новичок",
      accent_theme: "purple",
      daily_date: new Date().toISOString().slice(0, 10),
      daily_listened_seconds: 0,
      daily_favorites_added: 0,
      daily_completed_tracks: 0,
      playlist_xp_claimed: false,
    };

    // Профиль обычно уже создан триггером handle_new_user при регистрации,
    // поэтому upsert, а не insert: не падаем на конфликте первичного ключа.
    const { data: row, error } = await client
      .from("profiles")
      .upsert({ id: data.userId, ...payload }, { onConflict: "id" })
      .select("*")
      .single<ProfileRow>();

    if (error) throw error;
    return rowToProfile(row);
  }

  async update(userId: string, input: UserProfileInput): Promise<UserProfile> {
    const client = requireSupabase();

    const patch = profileInputToRow(input);

    // Если ник изменили, но хендл не задали — пересчитываем (как в localStorage-версии).
    if (input.nick && !input.handle) {
      patch.tag = nickToHandle(input.nick);
    }

    const { data, error } = await client
      .from("profiles")
      .update(patch)
      .eq("id", userId)
      .select("*")
      .single<ProfileRow>();

    if (error) throw error;
    return rowToProfile(data);
  }
}

export const supabaseProfileRepository = new SupabaseProfileRepository();

// ── Прогрессия: XP / уровень / ранг + дневное состояние ───────────────

export type ProgressionRow = {
  xp: number;
  level: number;
  rank_tier: number;
  rank_name: string;
  daily_date: string;
  daily_listened_seconds: number;
  daily_favorites_added: number;
  daily_completed_tracks: number;
  playlist_xp_claimed: boolean;
};

/** Читает прогрессию профиля (для гидратации стора при входе). */
export async function fetchProgression(
  userId: string,
): Promise<ProgressionRow | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "xp, level, rank_tier, rank_name, daily_date, daily_listened_seconds, daily_favorites_added, daily_completed_tracks, playlist_xp_claimed",
    )
    .eq("id", userId)
    .maybeSingle<ProgressionRow>();

  if (error) {
    console.warn("[sync] не удалось прочитать прогрессию:", error.message);
    return null;
  }

  return data;
}

/**
 * Онбординг профиля после входа через Google.
 *
 * Триггер `handle_new_user` создаёт строку в `profiles`, но он не знает
 * про данные Google-аккаунта. Здесь мы подставляем имя и аватар из
 * `user_metadata`, но только если поля ещё пустые — ручные правки
 * пользователя никогда не перетираются.
 *
 * Возвращает true, если что-то было обновлено (чтобы UI мог перечитать профиль).
 */
export async function ensureProfileFromAuthMetadata(): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;

  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return false;

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;

  // Google кладёт имя в full_name/name, аватар — в avatar_url/picture.
  const metaName =
    pickString(metadata.full_name) ||
    pickString(metadata.name) ||
    pickString(metadata.user_name);

  const metaAvatar =
    pickString(metadata.avatar_url) || pickString(metadata.picture);

  const { data: row, error } = await supabase
    .from("profiles")
    .select("username, avatar_url, bio")
    .eq("id", user.id)
    .maybeSingle<{ username: string | null; avatar_url: string | null; bio: string | null }>();

  if (error) {
    console.warn("[auth] не удалось прочитать профиль для онбординга:", error.message);
    return false;
  }

  const patch: Record<string, unknown> = {};

  // Триггер ставит 'listener' / часть email, если имя не передали — считаем
  // такое значение незаполненным и подставляем имя из Google.
  const currentName = (row?.username ?? "").trim();
  const isPlaceholderName =
    !currentName ||
    currentName === "listener" ||
    currentName === "sqwer" ||
    currentName === user.email?.split("@")[0];

  if (metaName && isPlaceholderName) {
    patch.username = metaName;
    patch.tag = nickToHandle(metaName);
  }

  if (metaAvatar && !row?.avatar_url) {
    patch.avatar_url = metaAvatar;
  }

  if (Object.keys(patch).length === 0) return false;

  // upsert, а не update: строки может не быть, если триггер не сработал
  // (например, пользователь создан до применения миграции).
  const { error: writeError } = await supabase
    .from("profiles")
    .upsert({ id: user.id, ...patch }, { onConflict: "id" });

  if (writeError) {
    console.warn("[auth] онбординг профиля не удался:", writeError.message);
    return false;
  }

  return true;
}

function pickString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Пишет прогрессию в профиль. Вызывать с дебаунсом: во время прослушивания
 * значение меняется каждую секунду.
 */
export async function pushProgression(
  userId: string,
  progress: {
    xp: number;
    dailyDate: string;
    listenedSeconds: number;
    favoritesAdded: number;
    completedTracks: number;
    playlistXpClaimed: boolean;
  },
): Promise<void> {
  const rank = getRankByXp(progress.xp);

  await syncWrite(
    {
      kind: "profile:update",
      at: Date.now(),
      payload: {
        xp: progress.xp,
        level: getLevelByXp(progress.xp),
        rank_tier: rank.tier,
        rank_name: rank.id,
        daily_date: progress.dailyDate,
        daily_listened_seconds: progress.listenedSeconds,
        daily_favorites_added: progress.favoritesAdded,
        daily_completed_tracks: progress.completedTracks,
        playlist_xp_claimed: progress.playlistXpClaimed,
      },
    },
    async () => {
      const client = requireSupabase();
      const { error } = await client
        .from("profiles")
        .update({
          xp: progress.xp,
          level: getLevelByXp(progress.xp),
          rank_tier: rank.tier,
          rank_name: rank.id,
          daily_date: progress.dailyDate,
          daily_listened_seconds: progress.listenedSeconds,
          daily_favorites_added: progress.favoritesAdded,
          daily_completed_tracks: progress.completedTracks,
          playlist_xp_claimed: progress.playlistXpClaimed,
        })
        .eq("id", userId);
      if (error) throw error;
    },
  );
}
