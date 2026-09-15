import type { UserProfile, UserProfileInput } from "../../types/profile";

/**
 * Репозиторий профилей.
 *
 * Сейчас реализация — localStorage-адаптер, чтобы проект работал из коробки
 * (mock-users + редактирование). Перед деплоем реализацию нужно подменить на
 * Supabase-клиент, НЕ трогая вызовы из UI — сигнатуры методов уже спроектированы
 * под будущие supabase-колонки.
 *
 * Желаемая схема в Supabase (SQL, позже):
 *   create table profiles (
 *     id uuid references auth.users primary key,
 *     handle text unique,
 *     nick text,
 *     avatar_url text,
 *     cover_url text,
 *     bio text,
 *     rank text,
 *     followers int default 0,
 *     following int default 0,
 *     updated_at timestamptz default now()
 *   );
 */

const PROFILE_STORAGE_KEY = "noctra.profile";
const DEFAULT_FOLLOWERS = 1284;
const DEFAULT_FOLLOWING = 318;

export const DEMO_PROFILE_ID = "demo-noctra";

function defaultProfile(): UserProfile {
  return {
    id: DEMO_PROFILE_ID,
    nick: "Mocevn",
    handle: "@mocevn",
    status: "wandering through the midnight guild",
    bio: "Dark fantasy enjoyer, playlist collector, and late-night gamer.",
    rank: "Nightborn",
    avatarUrl: null,
    coverUrl: null,
    followers: DEFAULT_FOLLOWERS,
    following: DEFAULT_FOLLOWING,
  };
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // квота localStorage может быть заполнена тяжёлыми dataURL — глушим
  }
}

/** Уникальный хендл из ника: "Mocevn" -> "@mocevn". */
export function nickToHandle(nick: string): string {
  const normalized = nick.replace(/@/g, "").replace(/\s+/g, "").trim();
  return normalized ? `@${normalized}` : "@user";
}

export interface ProfileRepository {
  getByUserId(userId: string): Promise<UserProfile | null>;
  create(data: {
    userId: string;
    nick: string;
    rest?: Partial<UserProfile>;
  }): Promise<UserProfile>;
  update(userId: string, input: UserProfileInput): Promise<UserProfile>;
}

class LocalStorageProfileRepository implements ProfileRepository {
  private listAll(): Record<string, UserProfile> {
    return read<Record<string, UserProfile>>(PROFILE_STORAGE_KEY) ?? {};
  }

  private persistAll(all: Record<string, UserProfile>): void {
    write(PROFILE_STORAGE_KEY, all);
  }

  async getByUserId(userId: string): Promise<UserProfile | null> {
    const all = this.listAll();
    const found = all[userId];
    if (found) return found;

    // Демо: если профиля нет, но юзер ли ждёт demo — создаём фоллбэк.
    if (userId === DEMO_PROFILE_ID) {
      const demo = { ...defaultProfile(), id: userId };
      all[userId] = demo;
      this.persistAll(all);
      return demo;
    }

    return null;
  }

  async create(data: {
    userId: string;
    nick: string;
    rest?: Partial<UserProfile>;
  }): Promise<UserProfile> {
    const profile: UserProfile = {
      ...defaultProfile(),
      id: data.userId,
      nick: data.nick.trim(),
      handle: nickToHandle(data.nick),
      // статус/ранг по умолчанию на русске/англ вешаем на UI словарь, тут задел.
      rank: "Nightborn",
      status: "new to the guild",
      ...data.rest,
    };

    const all = this.listAll();
    all[data.userId] = profile;
    this.persistAll(all);
    return profile;
  }

  async update(userId: string, input: UserProfileInput): Promise<UserProfile> {
    const existing = await this.getByUserId(userId);
    if (!existing) throw new Error(`Profile not found for user ${userId}`);

    const merged: UserProfile = { ...existing, ...input };
    // Пересчитываем handle, если поменяли nick и явно не задали handle.
    if (input.nick && !input.handle) {
      merged.handle = nickToHandle(input.nick);
    }

    const all = this.listAll();
    all[userId] = merged;
    this.persistAll(all);
    return merged;
  }
}

/**
 * Локальный (localStorage) адаптер репозитория профилей.
 *
 * Оставлен как рабочий режим, когда Supabase не настроен (`VITE_SUPABASE_URL`
 * пустой): приложение полностью функционально без бэкенда. Выбор конкретной
 * реализации живёт в `src/lib/repository.ts` — там же подключается облачный
 * адаптер, поэтому циклических импортов между файлами нет.
 */
export const localProfileRepository: ProfileRepository =
  new LocalStorageProfileRepository();

/**
 * Реальный (локальный demo) профиль, который сейчас «залогинен».
 * TODO(supabase): источником станет select * from profiles where id = auth.uid().
 */
export async function loadCurrentProfile(): Promise<UserProfile> {
  const stored = await localProfileRepository.getByUserId(DEMO_PROFILE_ID);
  return stored ?? (await localProfileRepository.create({ userId: DEMO_PROFILE_ID, nick: "Mocevn" }));
}
