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
  /**
   * Играет ли трек прямо сейчас.
   *
   * Нужен, чтобы переключение воспроизведения опиралось на реальное
   * состояние плеера, а не на флаг в сторе: при рассинхроне кнопка
   * делала бы противоположное задуманному.
   */
  getIsPlaying: () => boolean;
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

/**
 * Определяет позицию текущего трека в пуле воспроизведения.
 *
 * Полагаться на сохранённый `currentTrackIndex` нельзя: он легко расходится
 * с реальностью — плейлист пересобрали, трек удалили, воспроизведение начали
 * из поиска с другим списком. Если индекс «съехал», переключение уходило не на
 * соседний трек, а на случайный, либо плеер останавливался, решив, что достиг
 * конца списка.
 *
 * Поэтому сначала ищем трек по id. Индекс используем только как запасной
 * вариант — когда трека в пуле нет вовсе (например, он уже удалён).
 */
function resolveCurrentIndex(
  state: { currentTrack: PlaylistTrack | null; currentTrackIndex: number },
  pool: PlaylistTrack[],
): number {
  if (pool.length === 0) return 0;

  if (state.currentTrack) {
    const found = pool.findIndex((track) => track.id === state.currentTrack?.id);
    if (found >= 0) return found;
  }

  // Трека нет в пуле — берём сохранённый индекс, но зажимаем в границы:
  // иначе next/prev уйдут в undefined.
  return Math.min(Math.max(0, state.currentTrackIndex), pool.length - 1);
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

        const { playMode } = state;

        /*
         * Режим «повтор одного» влияет только на АВТОПЕРЕХОД по окончании
         * трека. Ручное переключение кнопкой всегда идёт на соседний трек —
         * иначе кнопка «следующий» выглядела бы сломанной: трек начинался бы
         * заново и казалось, что ничего не происходит.
         *
         * Поэтому здесь repeat-one НЕ обрабатывается: за зацикливание
         * отвечает handleTrackEnded в плеере.
         */
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

        /*
         * Позицию берём по id текущего трека, а не из currentTrackIndex.
         *
         * Индекс может разойтись с реальным положением трека: например, если
         * плейлист пересобрали, трек удалили или пользователь попал на него
         * через поиск. Тогда переключение уходило не туда или вообще
         * останавливало плеер на «последнем» треке.
         */
        const currentIndex = resolveCurrentIndex(state, pool);
        const lastIndex = pool.length - 1;
        const nextIndex = currentIndex + 1;

        if (nextIndex > lastIndex) {
          // Конец списка: по кругу или стоп — зависит от режима.
          if (playMode === "repeat-all") {
            set({ currentTrack: pool[0], currentTrackIndex: 0, isPlaying: true });
          } else {
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

        // Как и в playNext, позицию определяем по id, а не по индексу.
        const currentIndex = resolveCurrentIndex(state, pool);

        const prevIndex =
          currentIndex <= 0
            ? state.playMode === "repeat-all"
              ? pool.length - 1
              : 0
            : currentIndex - 1;

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
      /*
       * Переключение воспроизведения.
       *
       * Спрашиваем РЕАЛЬНОЕ состояние плеера, а не флаг из стора.
       *
       * Раньше здесь читался `isPlaying`, и из-за рассинхрона логика
       * переворачивалась: флаг говорил «играет», хотя трек стоял на паузе,
       * и нажатие вместо запуска отправляло ещё одну паузу. Снаружи это
       * выглядело как «пробел работает через раз» — трек не запускался.
       *
       * `audioControls.getIsPlaying()` читает состояние напрямую: у `<audio>`
       * это свойство `paused`, у YouTube-плеера — код состояния. Поэтому
       * команда всегда соответствует тому, что человек слышит.
       */
      requestToggle: () => {
        /*
         * Панель плеера НЕ открываем.
         *
         * Раньше здесь был `playerOpener?.()`, и каждое нажатие пробела
         * разворачивало панель поверх интерфейса — при управлении с клавиатуры
         * это выглядело как самопроизвольное открытие плеера. Панель
         * открывается только осознанно: тапом по кнопке плеера.
         */
        const actuallyPlaying = audioControls?.getIsPlaying() ?? get().isPlaying;

        if (actuallyPlaying) {
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
      /*
       * Очередь и текущий трек переживают перезагрузку.
       *
       * Раньше сохранялись только режим, громкость и mute. Из-за этого после
       * F5 плеер оказывался пустым: `playQueue` обнулялся, `currentTrack`
       * пропадал, и кнопки переключения выключались — переключать было нечего.
       * Снаружи это выглядело как «переключение треков не работает» и
       * «треки не сохраняются», хотя на самом деле терялось состояние плеера.
       *
       * `isPlaying` намеренно НЕ сохраняем: после перезагрузки браузер всё
       * равно не даст запустить звук без действия пользователя (политика
       * автовоспроизведения). Поэтому трек восстанавливается на паузе —
       * человек видит, что слушал, и продолжает одним нажатием.
       */
      partialize: (state) => ({
        playMode: state.playMode,
        volume: state.volume,
        isMuted: state.isMuted,
        playQueue: state.playQueue,
        trackQueue: state.trackQueue,
        currentTrack: state.currentTrack,
        currentTrackIndex: state.currentTrackIndex,
        shuffleHistory: state.shuffleHistory,
      }),
    },
  ),
);
