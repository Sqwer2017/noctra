import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  FAVORITE_XP_DAILY_CAP,
  PLAYLIST_MIN_TRACKS,
  XP_PER_FAVORITE,
  XP_PER_LISTEN_SECONDS,
  XP_PER_PLAYLIST,
  getRankByXp,
  getRankProgress,
} from "../lib/ranks";
import type { Rank, RankProgress } from "../lib/ranks";
import { throttle } from "../lib/async";
import { isSupabaseConfigured } from "../lib/supabase";
import { currentUserId } from "../lib/supabase/sync";
import { fetchProgression, pushProgression } from "../lib/supabase/profile";
import { fetchListeningStats, pushListeningStats } from "../lib/supabase/stats";
import {
  fetchQuestProgress,
  pushQuestClaimed,
  pushQuestProgress,
} from "../lib/supabase/quests";

/** Локальная дата в формате YYYY-MM-DD. */
export function todayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Секунды до следующей полуночи (для отсчёта до сброса квестов). */
export function secondsUntilTomorrow(now = new Date()): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(0, Math.floor((next.getTime() - now.getTime()) / 1000));
}

export type QuestId = "immersion" | "collector" | "nightMarathon";

export type QuestState = {
  /** Забрана ли награда сегодня. */
  claimed: boolean;
};

/** Конфиг ежедневных заданий. */
export const QUESTS: {
  id: QuestId;
  titleKey: string;
  target: number;
  rewardXP: number;
}[] = [
  { id: "immersion", titleKey: "quest.immersion", target: 30, rewardXP: 10 },
  { id: "collector", titleKey: "quest.collector", target: 3, rewardXP: 5 },
  { id: "nightMarathon", titleKey: "quest.nightMarathon", target: 10, rewardXP: 8 },
];

type DailyState = {
  date: string;
  /** Секунды прослушивания за день (для квеста «Погружение» и XP). */
  listenedSeconds: number;
  /** Добавлений в избранное за день (для квеста и лимита XP). */
  favoritesAdded: number;
  /** Полностью прослушанные треки за день (для «Ночного марафона»). */
  completedTracks: number;
  /** Начислено ли XP за публичный плейлист сегодня. */
  playlistXpClaimed: boolean;
  /** Статусы квестов. */
  quests: Record<QuestId, QuestState>;
};

function freshDay(date = todayKey()): DailyState {
  return {
    date,
    listenedSeconds: 0,
    favoritesAdded: 0,
    completedTracks: 0,
    playlistXpClaimed: false,
    quests: {
      immersion: { claimed: false },
      collector: { claimed: false },
      nightMarathon: { claimed: false },
    },
  };
}

type ProgressionState = {
  /** Суммарный накопленный опыт (persist). */
  totalXP: number;
  /** Всего секунд прослушано за всё время. */
  totalSecondsListened: number;
  /** Всего треков прослушано (уникальные/события). */
  totalTracksPlayed: number;
  /** Минуты прослушивания по дням: { 'YYYY-MM-DD': minutes }. */
  historyMap: Record<string, number>;
  /** Дневное состояние (XP-лимиты, прогресс квестов). */
  daily: DailyState;

  // ── действия ──────────────────────────────────────────────────────
  /** Начисляет XP напрямую (награды/события). */
  addXp: (amount: number) => void;
  /** Тик прослушивания: +1 сек; каждые 300 сек даёт +1 XP. */
  tickListening: (seconds: number) => void;
  /**
   * Трек доигран до конца (onEnded).
   *
   * Единственный источник счётчика «треков прослушано» и прогресса квеста
   * «Ночной марафон»: переключения и паузы в статистику не попадают.
   */
  registerTrackCompleted: () => void;
  /** Добавление в избранное: квест + XP (с дневным лимитом). */
  registerFavoriteAdded: () => void;
  /** Публичный плейлист с ≥10 треками: +15 XP раз в сутки. */
  registerPublicPlaylistComplete: (isPublic: boolean, trackCount: number) => void;
  /** Забрать награду за квест (если выполнен и не забран). */
  claimQuest: (id: QuestId) => void;
  /** Сбросить дневное состояние, если наступил новый день. */
  rolloverIfNeeded: () => void;

  // ── производные ───────────────────────────────────────────────────
  getCurrentRank: () => Rank;
  getProgress: () => RankProgress;
  getQuestProgress: (id: QuestId) => number;

  // ── синхронизация с облаком ───────────────────────────────────────
  /** Подтягивает прогресс и статистику из БД (при входе). */
  hydrateFromCloud: () => Promise<void>;
  /** Принудительно отправляет накопленное (пауза, уход со страницы). */
  flushToCloud: () => Promise<void>;
  /** Запись при скрытии вкладки — надёжнее, чем beforeunload. */
  flushOnHide: () => void;
  /** Сброс при выходе из аккаунта. */
  resetLocal: () => void;
};

// ── Фоновая отправка в Supabase ───────────────────────────────────────
//
// Прослушивание тикает раз в секунду, и раньше здесь стоял debounce с окном
// 3 секунды. Это была ошибка: каждый тик сбрасывал таймер, поэтому под
// непрерывной музыкой запись не уходила НИКОГДА — она ждала паузы в 3 секунды.
// Набранный XP оставался только в памяти и терялся при перезагрузке.
//
// Теперь throttle: первый вызов проходит сразу, следующие — не чаще раза
// в SYNC_INTERVAL_MS, но с обязательным «догоняющим» вызовом. Прогресс
// уходит в базу даже во время непрерывного прослушивания.
const SYNC_INTERVAL_MS = 3_000;

/** Отправляет текущее состояние прогресса в облако. */
async function syncProgressionNow(): Promise<void> {
  if (!isSupabaseConfigured) return;

  const userId = await currentUserId();
  if (!userId) return;

  const state = useProgressionStore.getState();
  const { daily, historyMap, totalSecondsListened, totalTracksPlayed, totalXP } = state;

  await pushProgression(userId, {
    xp: totalXP,
    dailyDate: daily.date,
    listenedSeconds: daily.listenedSeconds,
    favoritesAdded: daily.favoritesAdded,
    completedTracks: daily.completedTracks,
    playlistXpClaimed: daily.playlistXpClaimed,
  });

  await pushListeningStats({
    totalSecondsListened,
    totalTracksPlayed,
    activeDaysCount: Object.keys(historyMap).length,
    history: historyMap,
  });
}

/**
 * Дебаунс живёт на уровне модуля, а не в сторе: он не должен попадать
 * в persist-снапшот и обязан быть общим для всех вызовов.
 */
const scheduleCloudSync = throttle(() => {
  void syncProgressionNow();
}, SYNC_INTERVAL_MS);

/**
 * Объединяет историю прослушивания по дням.
 *
 * По каждой дате берём большее значение: минуты только накапливаются, поэтому
 * расхождение означает, что одно из хранилищ отстало. Складывать нельзя —
 * получилось бы задвоение.
 */
function mergeHistory(
  local: Record<string, number>,
  cloud: Record<string, number>,
): Record<string, number> {
  const merged: Record<string, number> = { ...cloud };

  for (const [date, minutes] of Object.entries(local)) {
    merged[date] = Math.max(merged[date] ?? 0, minutes);
  }

  return merged;
}

/** Отправляет состояние одного задания (прогресс или факт награды). */
async function persistQuest(id: QuestId, claimed: boolean): Promise<void> {
  if (!isSupabaseConfigured) return;

  const quest = QUESTS.find((q) => q.id === id);
  if (!quest) return;

  const state = useProgressionStore.getState();
  const progress = state.getQuestProgress(id);

  if (claimed) {
    await pushQuestClaimed(id, state.daily.date, progress, quest.target);
    return;
  }

  await pushQuestProgress(
    id,
    state.daily.date,
    progress,
    quest.target,
    progress >= quest.target,
  );
}

/** Синхронизирует прогресс квеста по его текущему значению. */
async function syncQuestProgress(id: QuestId): Promise<void> {
  await persistQuest(id, useProgressionStore.getState().daily.quests[id].claimed);
}

export const useProgressionStore = create<ProgressionState>()(
  persist(
    (set, get) => ({
      totalXP: 0,
      totalSecondsListened: 0,
      totalTracksPlayed: 0,
      historyMap: {},
      daily: freshDay(),

      rolloverIfNeeded: () => {
        const today = todayKey();
        if (get().daily.date !== today) {
          set({ daily: freshDay(today) });
        }
      },

      addXp: (amount) => {
        if (amount <= 0) return;
        set((state) => ({ totalXP: state.totalXP + amount }));
      },

      tickListening: (seconds) => {
        if (seconds <= 0) return;
        get().rolloverIfNeeded();

        const state = get();
        const today = todayKey();
        const prevDaySeconds = state.daily.listenedSeconds;
        const nextDaySeconds = prevDaySeconds + seconds;

        // XP за каждые полные 300 сек (учитываем переход через порог).
        const prevXp = Math.floor(prevDaySeconds / XP_PER_LISTEN_SECONDS);
        const nextXp = Math.floor(nextDaySeconds / XP_PER_LISTEN_SECONDS);
        const gainedXp = nextXp - prevXp;

        const prevMinutes = state.historyMap[today] ?? 0;
        const nextMinutes = prevMinutes + seconds / 60;

        set({
          totalSecondsListened: state.totalSecondsListened + seconds,
          totalXP: state.totalXP + gainedXp,
          historyMap: { ...state.historyMap, [today]: nextMinutes },
          daily: { ...state.daily, listenedSeconds: nextDaySeconds },
        });

        scheduleCloudSync();
      },

      registerTrackCompleted: () => {
        get().rolloverIfNeeded();

        /*
         * Полное прослушивание увеличивает и общий счётчик «треков прослушано»
         * (`total_tracks_played` в user_stats), и дневной прогресс квеста.
         *
         * Это единственное место, где растёт totalTracksPlayed: раньше счётчик
         * увеличивался ещё и при старте трека, из-за чего в статистику попадали
         * переключения, а не прослушивания.
         */
        set((state) => ({
          totalTracksPlayed: state.totalTracksPlayed + 1,
          daily: {
            ...state.daily,
            completedTracks: state.daily.completedTracks + 1,
          },
        }));

        void syncQuestProgress("nightMarathon");
        scheduleCloudSync();
      },

      registerFavoriteAdded: () => {
        get().rolloverIfNeeded();
        const state = get();
        const canGainXp =
          state.daily.favoritesAdded < FAVORITE_XP_DAILY_CAP;

        set({
          totalXP: state.totalXP + (canGainXp ? XP_PER_FAVORITE : 0),
          daily: {
            ...state.daily,
            favoritesAdded: state.daily.favoritesAdded + 1,
          },
        });

        void syncQuestProgress("collector");
        scheduleCloudSync();
      },

      registerPublicPlaylistComplete: (isPublic, trackCount) => {
        get().rolloverIfNeeded();
        const state = get();

        if (!isPublic || trackCount < PLAYLIST_MIN_TRACKS) return;
        if (state.daily.playlistXpClaimed) return;

        set({
          totalXP: state.totalXP + XP_PER_PLAYLIST,
          daily: { ...state.daily, playlistXpClaimed: true },
        });

        scheduleCloudSync();
      },

      claimQuest: (id) => {
        get().rolloverIfNeeded();
        const state = get();
        const quest = QUESTS.find((q) => q.id === id);
        if (!quest) return;
        if (state.daily.quests[id].claimed) return;
        if (get().getQuestProgress(id) < quest.target) return;

        set({
          totalXP: state.totalXP + quest.rewardXP,
          daily: {
            ...state.daily,
            quests: {
              ...state.daily.quests,
              [id]: { claimed: true },
            },
          },
        });

        // Награду фиксируем сразу, без дебаунса: это редкое и важное событие,
        // а счётчик XP уже обновлён локально.
        void persistQuest(id, true);
        scheduleCloudSync();
      },

      getCurrentRank: () => getRankByXp(get().totalXP),
      getProgress: () => getRankProgress(get().totalXP),

      getQuestProgress: (id) => {
        const { daily } = get();
        if (id === "immersion") return Math.floor(daily.listenedSeconds / 60);
        if (id === "collector") return daily.favoritesAdded;
        return daily.completedTracks;
      },

      hydrateFromCloud: async () => {
        if (!isSupabaseConfigured) return;

        const userId = await currentUserId();
        if (!userId) return;

        const [progression, stats, quests] = await Promise.all([
          fetchProgression(userId),
          fetchListeningStats(userId),
          fetchQuestProgress(userId, todayKey()),
        ]);

        const patch: Partial<ProgressionState> = {};

        /*
         * СЛИЯНИЕ, а не перезапись.
         *
         * Раньше здесь стоял `patch.totalXP = progression.xp ?? 0` — облачное
         * значение затирало локальное безусловно. Если часть прогресса ещё не
         * успела уйти в базу (синк в полёте, сеть мигнула, страницу закрыли),
         * набранный XP пропадал: было 23 — после перезагрузки стало 16.
         *
         * Накопительные счётчики только растут, поэтому берём максимум —
         * так не теряется ни локальный прогресс, ни облачный (например,
         * набранный с другого устройства).
         */
        const local = get();

        if (progression) {
          patch.totalXP = Math.max(local.totalXP, progression.xp ?? 0);

          // Дневное состояние переносим, только если оно за сегодня —
          // иначе локальный rollover сам обнулит счётчики.
          if (progression.daily_date === todayKey()) {
            patch.daily = {
              date: progression.daily_date,
              // Дневные счётчики тоже берём по максимуму: они обнуляются
              // при смене дня, поэтому расхождение означает недосинкронизацию.
              listenedSeconds: Math.max(
                local.daily.listenedSeconds,
                progression.daily_listened_seconds ?? 0,
              ),
              favoritesAdded: Math.max(
                local.daily.favoritesAdded,
                progression.daily_favorites_added ?? 0,
              ),
              completedTracks: Math.max(
                local.daily.completedTracks,
                progression.daily_completed_tracks ?? 0,
              ),
              playlistXpClaimed:
                local.daily.playlistXpClaimed ||
                Boolean(progression.playlist_xp_claimed),
              quests: {
                immersion: { claimed: false },
                collector: { claimed: false },
                nightMarathon: { claimed: false },
              },
            };
          }
        }

        if (stats) {
          patch.totalSecondsListened = Math.max(
            local.totalSecondsListened,
            stats.totalSecondsListened,
          );
          patch.totalTracksPlayed = Math.max(
            local.totalTracksPlayed,
            stats.totalTracksPlayed,
          );

          // Историю по дням объединяем: по каждой дате берём большее значение.
          patch.historyMap = mergeHistory(local.historyMap, stats.history);
        }

        // Статусы наград берём из таблицы квестов — она точнее.
        for (const row of quests) {
          const id = row.quest_id as QuestId;
          if (!QUESTS.some((quest) => quest.id === id)) continue;

          const base = patch.daily ?? get().daily;
          patch.daily = {
            ...base,
            quests: {
              ...base.quests,
              [id]: { claimed: Boolean(row.claimed_at) },
            },
          };
        }

        set(patch);
      },

      flushToCloud: async () => {
        // Гасим отложенный вызов и пишем немедленно: вызывается при уходе
        // со страницы и выходе из аккаунта, когда ждать окно троттлинга нельзя.
        scheduleCloudSync.cancel();
        await syncProgressionNow();
      },

      /**
       * Записывает прогресс при скрытии вкладки.
       *
       * Именно `visibilitychange`, а не `beforeunload`: браузер не даёт
       * дождаться асинхронной записи при закрытии страницы, поэтому
       * `beforeunload` + await не гарантировал сохранение. Событие скрытия
       * вкладки обрабатывается надёжно (в том числе при сворачивании
       * и переходе в другое приложение на телефоне).
       */
      flushOnHide: () => {
        if (typeof document === "undefined") return;

        if (document.visibilityState === "hidden") {
          scheduleCloudSync.cancel();
          void syncProgressionNow();
        }
      },

      resetLocal: () =>
        set({
          totalXP: 0,
          totalSecondsListened: 0,
          totalTracksPlayed: 0,
          historyMap: {},
          daily: freshDay(),
        }),
    }),
    {
      name: "noctra.progression",
      partialize: (state) => ({
        totalXP: state.totalXP,
        totalSecondsListened: state.totalSecondsListened,
        totalTracksPlayed: state.totalTracksPlayed,
        historyMap: state.historyMap,
        daily: state.daily,
      }),
    },
  ),
);
