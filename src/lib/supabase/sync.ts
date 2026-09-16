import { isSupabaseConfigured, supabase } from "../supabase";

/**
 * Слой синхронизации: оптимистичный UI + фоновые записи + очередь повторов.
 *
 * Принцип: локальный стейт обновляется синхронно и мгновенно (UI никогда не
 * ждёт сеть), а запись в Supabase уходит в фоне. Если запись не удалась —
 * операция кладётся в очередь в localStorage и повторяется позже: при
 * следующем запуске, восстановлении сети или успешной записи.
 *
 * Когда Supabase не настроен (нет VITE_SUPABASE_URL), все функции становятся
 * no-op, и приложение работает полностью локально.
 */

const QUEUE_KEY = "noctra.syncQueue";

export type SyncOperation =
  | { kind: "favorite:add"; at: number; payload: Record<string, unknown> }
  | { kind: "favorite:remove"; at: number; payload: { trackId: string } }
  | { kind: "profile:update"; at: number; payload: Record<string, unknown> }
  | { kind: "stats:update"; at: number; payload: Record<string, unknown> }
  | { kind: "quest:claim"; at: number; payload: Record<string, unknown> }
  | { kind: "quest:progress"; at: number; payload: Record<string, unknown> }
  | { kind: "playlist:update"; at: number; payload: { id: string; patch: Record<string, unknown> } }
  | { kind: "playlist:delete"; at: number; payload: { id: string } }
  | {
      kind: "playlist:track-add";
      at: number;
      payload: { playlistId: string; track: Record<string, unknown>; orderIndex: number };
    }
  | {
      kind: "playlist:track-remove";
      at: number;
      payload: { playlistId: string; trackId: string };
    };

// ── очередь ───────────────────────────────────────────────────────────

function readQueue(): SyncOperation[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as SyncOperation[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: SyncOperation[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-200)));
  } catch {
    // Квота заполнена — очередь не критична для работы UI, просто теряем её.
  }
}

function enqueue(op: SyncOperation): void {
  writeQueue([...readQueue(), op]);
}

/** Сколько операций ждёт отправки (для индикатора в UI). */
export function pendingSyncCount(): number {
  return readQueue().length;
}

// ── вспомогательное ───────────────────────────────────────────────────

/** Текущий uid авторизованного пользователя (или null в локальном режиме). */
export async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;

  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/**
 * Выполняет запись в облако. При ошибке — кладёт операцию в очередь повтора.
 * Никогда не бросает: синхронизация не должна ломать UI.
 */
export async function syncWrite(
  op: SyncOperation,
  run: (userId: string) => Promise<void>,
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) return false;

  const userId = await currentUserId();
  if (!userId) return false;

  try {
    await run(userId);
    return true;
  } catch (error) {
    console.warn("[sync] запись не удалась, ставим в очередь:", error);
    enqueue(op);
    return false;
  }
}

// ── повтор отложенных операций ────────────────────────────────────────

/**
 * Пытается выполнить накопившиеся операции. Вызывается при старте и при
 * возвращении соединения. Операции, которые снова не прошли, остаются в очереди.
 */
export async function flushSyncQueue(): Promise<number> {
  if (!isSupabaseConfigured || !supabase) return 0;

  const userId = await currentUserId();
  if (!userId) return 0;

  const queue = readQueue();
  if (queue.length === 0) return 0;

  const remaining: SyncOperation[] = [];
  let flushed = 0;

  for (const op of queue) {
    try {
      await runQueuedOperation(userId, op);
      flushed += 1;
    } catch {
      remaining.push(op);
    }
  }

  writeQueue(remaining);
  return flushed;
}

async function runQueuedOperation(
  userId: string,
  op: SyncOperation,
): Promise<void> {
  if (!supabase) return;

  switch (op.kind) {
    case "favorite:add": {
      const { error } = await supabase
        .from("favorites")
        .upsert({ user_id: userId, ...op.payload }, { onConflict: "user_id,track_id" });
      if (error) throw error;
      return;
    }

    case "favorite:remove": {
      const { error } = await supabase
        .from("favorites")
        .delete()
        .eq("user_id", userId)
        .eq("track_id", op.payload.trackId);
      if (error) throw error;
      return;
    }

    case "profile:update": {
      /*
       * Обновляем только поля из payload этого снимка.
       *
       * Снимок прогрессии уходит в очередь при сбое сети, и между сбоем и
       * повтором пользователь успевает набрать ещё XP. Если бы повтор писал
       * устаревший снимок целиком, он откатил бы более свежее значение —
       * именно так прогресс и «терялся через раз». Здесь же записывается
       * ровно то, что было отправлено.
       *
       * `.select()` позволяет отличить «обновили» от «строки нет»: PostgREST
       * на UPDATE без него отдаёт успех, даже когда не совпала ни одна строка,
       * и потеря записи оставалась незамеченной.
       *
       * updated_at проставит триггер profiles_set_updated_at.
       */
      const { data, error } = await supabase
        .from("profiles")
        .update(op.payload)
        .eq("id", userId)
        .select("id");

      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error(`profiles: строка ${userId} не найдена`);
      }

      return;
    }

    case "stats:update": {
      const { error } = await supabase
        .from("user_stats")
        .upsert({ user_id: userId, ...op.payload }, { onConflict: "user_id" });
      if (error) throw error;
      return;
    }

    case "quest:claim":
    case "quest:progress": {
      const { error } = await supabase
        .from("daily_quests_progress")
        .upsert(
          { user_id: userId, ...op.payload },
          { onConflict: "user_id,quest_id,reset_date" },
        );
      if (error) throw error;
      return;
    }

    case "playlist:update": {
      const { error } = await supabase
        .from("playlists")
        .update(op.payload.patch)
        .eq("id", op.payload.id)
        .eq("user_id", userId);
      if (error) throw error;
      return;
    }

    case "playlist:delete": {
      const { error } = await supabase
        .from("playlists")
        .delete()
        .eq("id", op.payload.id)
        .eq("user_id", userId);
      if (error) throw error;
      return;
    }

    case "playlist:track-add": {
      const { error } = await supabase.from("playlist_tracks").insert({
        playlist_id: op.payload.playlistId,
        ...op.payload.track,
        order_index: op.payload.orderIndex,
      });
      if (error) throw error;
      return;
    }

    case "playlist:track-remove": {
      const { error } = await supabase
        .from("playlist_tracks")
        .delete()
        .eq("playlist_id", op.payload.playlistId)
        .eq("track_id", op.payload.trackId);
      if (error) throw error;
      return;
    }
  }
}

/** Подписывается на восстановление сети, чтобы дослать очередь. */
export function watchConnectivity(onFlushed?: (count: number) => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = () => {
    void flushSyncQueue().then((count) => {
      if (count > 0) onFlushed?.(count);
    });
  };

  window.addEventListener("online", handler);
  return () => window.removeEventListener("online", handler);
}
