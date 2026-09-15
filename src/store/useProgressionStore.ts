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
  /** Инкремент «треков прослушано» (при старте/переключении трека). */
  registerTrackPlayed: () => void;
  /** Полное прослушивание трека (onEnded) — для квеста «Ночной марафон». */
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
};

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
      },

      registerTrackPlayed: () => {
        get().rolloverIfNeeded();
        set((state) => ({
          totalTracksPlayed: state.totalTracksPlayed + 1,
        }));
      },

      registerTrackCompleted: () => {
        get().rolloverIfNeeded();
        set((state) => ({
          daily: {
            ...state.daily,
            completedTracks: state.daily.completedTracks + 1,
          },
        }));
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
      },

      getCurrentRank: () => getRankByXp(get().totalXP),
      getProgress: () => getRankProgress(get().totalXP),

      getQuestProgress: (id) => {
        const { daily } = get();
        if (id === "immersion") return Math.floor(daily.listenedSeconds / 60);
        if (id === "collector") return daily.favoritesAdded;
        return daily.completedTracks;
      },
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
