import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { PlaylistTrack } from "../types/playlist";

export type PlayMode = "sequence" | "repeat-all" | "repeat-one" | "shuffle";

type PlayerState = {
  currentTrack: PlaylistTrack | null;

  /** Базовый список, из которого запустили воспроизведение (плейлист/поиск). */
  playQueue: PlaylistTrack[];
  /** Индекс внутри объединённого пула воспроизведения (playQueue + trackQueue). */
  currentTrackIndex: number;

  /** Пользовательская очередь: кнопка «+» или свайп вправо. */
  trackQueue: PlaylistTrack[];

  /** Запомненные id, проигранные в текущем проходе (для shuffle без повторов). */
  shuffleHistory: string[];

  playMode: PlayMode;
  isPlaying: boolean;

  // ── действия ───────────────────────────────────────────────────────
  playTrack: (track: PlaylistTrack, baseQueue?: PlaylistTrack[]) => void;
  playNext: () => void;
  playPrevious: () => void;
  /** Повтор текущего трека (для repeat-one на onEnded). */
  restartCurrent: () => void;
  selectQueueTrack: (track: PlaylistTrack) => void;

  pushToQueue: (track: PlaylistTrack) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;

  cyclePlayMode: () => void;
  setIsPlaying: (playing: boolean) => void;
  /** Суммарное прослушанное время (секунды) для виджета профиля. */
  listenedSeconds: number;
  addListened: (seconds: number) => void;
  /** Уникальные id треков, которые запускали (для статистики). */
  tracksPlayedIds: string[];
  /** Даты (YYYY-MM-DD) с активностью прослушивания. */
  activeDays: string[];
  /** Регистрирует старт трека: добавляет id и сегодняшнюю дату. */
  registerPlay: (trackId: string) => void;

  // ── разделяемое состояние основного плеера (для «Сейчас играет») ──
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;

  // ── мост к реальному <audio> (регистрируется из BottomPlayer) ─────
  registerAudioControls: (controls: AudioControls | null) => void;
  /** Регистрирует колбек «открой плеер» (из AppShell). */
  registerPlayerOpener: (open: (() => void) | null) => void;
  /** Гарантирует, что панель плеера открыта (для управления из дашборда). */
  requestOpenPlayer: () => void;
  requestToggle: () => void;
  requestSeek: (seconds: number) => void;
  requestSetVolume: (volume: number) => void;

  /** Пул = базовый плейлист + пользовательская очередь. */
  getPool: () => PlaylistTrack[];
};

/** Императивные команды реального аудио-элемента. */
export type AudioControls = {
  play: () => void;
  pause: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
};

/** Внутренняя ссылка на команды плеера (вне persist). */
let audioControls: AudioControls | null = null;
let playerOpener: (() => void) | null = null;

const MODE_CYCLE: PlayMode[] = [
  "sequence",
  "repeat-all",
  "repeat-one",
  "shuffle",
];

function dedupePush(queue: PlaylistTrack[], track: PlaylistTrack) {
  if (queue.some((item) => item.id === track.id)) {
    return queue;
  }
  return [...queue, track];
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      currentTrack: null,
      playQueue: [],
      currentTrackIndex: 0,
      trackQueue: [],
      shuffleHistory: [],
      playMode: "sequence",
      isPlaying: false,

      getPool: () => {
        const { playQueue, trackQueue } = get();
        return [...playQueue, ...trackQueue];
      },

      playTrack: (track, baseQueue) => {
        const base = baseQueue && baseQueue.length > 0 ? baseQueue : [track];
        const index = base.findIndex((item) => item.id === track.id);

        set({
          playQueue: base,
          currentTrackIndex: index >= 0 ? index : 0,
          currentTrack: track,
          isPlaying: true,
          shuffleHistory: [track.id],
        });
      },

      selectQueueTrack: (track) => {
        const pool = get().getPool();
        const index = pool.findIndex((item) => item.id === track.id);

        set({
          currentTrack: track,
          currentTrackIndex: index >= 0 ? index : 0,
          isPlaying: true,
        });
      },

      playNext: () => {
        const state = get();
        const pool = state.getPool();

        if (pool.length === 0) return;

        const { playMode, currentTrack } = state;

        if (playMode === "repeat-one" && currentTrack) {
          // Повтор того же трека — просто перезапускаем (обрабатывается в плеере).
          set({ isPlaying: true });
          return;
        }

        if (playMode === "shuffle") {
          const history = new Set(state.shuffleHistory);
          const unplayed = pool.filter((t) => !history.has(t.id));

          if (unplayed.length === 0) {
            // Проход завершён — начинаем новый.
            const next = pool[Math.floor(Math.random() * pool.length)];
            const index = pool.findIndex((t) => t.id === next.id);
            set({
              currentTrack: next,
              currentTrackIndex: index,
              isPlaying: true,
              shuffleHistory: [next.id],
            });
            return;
          }

          const next = unplayed[Math.floor(Math.random() * unplayed.length)];
          const index = pool.findIndex((t) => t.id === next.id);
          set({
            currentTrack: next,
            currentTrackIndex: index,
            isPlaying: true,
            shuffleHistory: [...state.shuffleHistory, next.id],
          });
          return;
        }

        const lastIndex = pool.length - 1;
        const nextIndex = state.currentTrackIndex + 1;

        if (nextIndex > lastIndex) {
          if (playMode === "repeat-all") {
            set({ currentTrack: pool[0], currentTrackIndex: 0, isPlaying: true });
          } else {
            // sequence: дошли до конца пула — останавливаемся.
            set({ isPlaying: false });
          }
          return;
        }

        set({
          currentTrack: pool[nextIndex],
          currentTrackIndex: nextIndex,
          isPlaying: true,
        });
      },

      playPrevious: () => {
        const state = get();
        const pool = state.getPool();

        if (pool.length === 0) return;

        const prevIndex =
          state.currentTrackIndex <= 0
            ? state.playMode === "repeat-all"
              ? pool.length - 1
              : 0
            : state.currentTrackIndex - 1;

        set({
          currentTrack: pool[prevIndex],
          currentTrackIndex: prevIndex,
          isPlaying: true,
        });
      },

      restartCurrent: () => {
        // Флаг для плеера: перезапустить текущий трек с начала.
        set((s) => ({ isPlaying: true, currentTrack: s.currentTrack }));
      },

      pushToQueue: (track) => {
        set((state) => ({
          trackQueue: dedupePush(state.trackQueue, track),
        }));
      },

      removeFromQueue: (index) => {
        set((state) => ({
          trackQueue: state.trackQueue.filter((_, i) => i !== index),
        }));
      },

      clearQueue: () => set({ trackQueue: [] }),

      cyclePlayMode: () => {
        set((state) => {
          const currentIdx = MODE_CYCLE.indexOf(state.playMode);
          const nextMode = MODE_CYCLE[(currentIdx + 1) % MODE_CYCLE.length];
          return { playMode: nextMode };
        });
      },

      setIsPlaying: (playing) => set({ isPlaying: playing }),

      listenedSeconds: 0,
      addListened: (seconds) =>
        set((state) => ({
          listenedSeconds: state.listenedSeconds + Math.max(0, seconds),
        })),

      tracksPlayedIds: [],
      activeDays: [],
      registerPlay: (trackId) =>
        set((state) => {
          const today = new Date().toISOString().slice(0, 10);
          const tracksPlayedIds = state.tracksPlayedIds.includes(trackId)
            ? state.tracksPlayedIds
            : [...state.tracksPlayedIds, trackId];
          const activeDays = state.activeDays.includes(today)
            ? state.activeDays
            : [...state.activeDays, today];
          return { tracksPlayedIds, activeDays };
        }),

      // ── разделяемое состояние основного плеера ─────────────────────
      currentTime: 0,
      duration: 0,
      volume: 0.75,
      isMuted: false,
      setCurrentTime: (time) => set({ currentTime: Math.max(0, time) }),
      setDuration: (duration) =>
        set({ duration: Number.isFinite(duration) ? Math.max(0, duration) : 0 }),
      setVolume: (volume) => {
        const clamped = Math.min(1, Math.max(0, volume));
        set({ volume: clamped, isMuted: clamped === 0 });
        audioControls?.setVolume(clamped);
      },
      toggleMute: () =>
        set((state) => {
          const isMuted = !state.isMuted;
          audioControls?.setVolume(isMuted ? 0 : state.volume);
          return { isMuted };
        }),

      // ── мост к реальному <audio> ──────────────────────────────────
      registerAudioControls: (controls) => {
        audioControls = controls;
      },
      registerPlayerOpener: (open) => {
        playerOpener = open;
      },
      requestOpenPlayer: () => {
        playerOpener?.();
      },
      requestToggle: () => {
        playerOpener?.();
        const { isPlaying } = get();
        if (isPlaying) {
          audioControls?.pause();
          set({ isPlaying: false });
        } else {
          audioControls?.play();
          set({ isPlaying: true });
        }
      },
      requestSeek: (seconds) => {
        playerOpener?.();
        audioControls?.seek(seconds);
        set({ currentTime: Math.max(0, seconds) });
      },
      requestSetVolume: (volume) => {
        get().setVolume(volume);
      },
    }),
    {
      name: "noctra.player",
      partialize: (state) => ({
        playMode: state.playMode,
        listenedSeconds: state.listenedSeconds,
        tracksPlayedIds: state.tracksPlayedIds,
        activeDays: state.activeDays,
        volume: state.volume,
        isMuted: state.isMuted,
      }),
    },
  ),
);
