import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  PLAYLIST_MIN_TRACKS,
  XP_PER_LISTEN_SECONDS,
  XP_PER_PLAYLIST,
  getLevelByXp,
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
  claimQuestReward,
  fetchQuestProgress,
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

/** Сколько часов считается «ночью» — для достижения «Полуночный пилигрим». */
const NIGHT_START_HOUR = 0;
const NIGHT_END_HOUR = 6;

/**
 * Накопительные метрики для достижений.
 *
 * Все они «рекордные», а не суммирующие: хранится максимум за всё время.
 * Так их нельзя накрутить перезагрузкой страницы — повторный проход просто
 * не превысит уже достигнутое значение. Это же спасает от задвоения при
 * повторной отправке в базу.
 */
export type AchievementCounters = {
  /** Треки, дослушанные ночью (00:00–05:59). */
  nightPlays: number;
  /** Самая длинная непрерывная сессия, секунды. */
  maxSessionSeconds: number;
  /** Максимум повторов подряд одного трека (режим «повтор одного»). */
  repeatLoops: number;
  /** Максимум треков подряд в режиме перемешивания. */
  shuffleStreak: number;
  /** Уникальные источники прослушанных треков. */
  sources: string[];
};

/** Длительность паузы, после которой сессия считается новой. */
const SESSION_BREAK_SECONDS = 300;

type DailyState = {
  date: string;
  /** Секунды прослушивания за день (для квеста «Погружение» и XP). */
  listenedSeconds: number;
  /**
   * Добавлений в избранное за день — для квеста «Коллекционер».
   *
   * Считает именно действия за день, поэтому растёт при каждом добавлении.
   * XP за избранное начисляется по другому списку (см. `favoriteXpTrackIds`):
   * платить за повторное добавление одного и того же трека нельзя.
   */
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
  /** Полностью прослушанные треки по дням: { 'YYYY-MM-DD': count }. */
  tracksByDay: Record<string, number>;
  /** Добавления в избранное по дням: { 'YYYY-MM-DD': count }. */
  favoritesByDay: Record<string, number>;
  /**
   * Секунды текущей непрерывной сессии.
   *
   * Растёт на каждом тике, пока играет музыка. Сбрасывается, если пауза
   * превысила SESSION_BREAK_SECONDS: иначе «сессией» оказалось бы всё время
   * с открытой вкладкой, и достижение за час непрерывного прослушивания
   * выдавалось бы просто за долгий день.
   */
  currentSessionSeconds: number;
  /** Когда был последний тик прослушивания (для определения разрыва). */
  lastTickAt: number;
  /**
   * Рекордные счётчики достижений.
   *
   * Хранятся как максимумы, поэтому не сбрасываются при перезагрузке
   * и не задваиваются при повторной записи.
   */
  counters: AchievementCounters;
  /** Текущая серия повторов одного трека (рабочее значение). */
  repeatRun: number;
  /** Текущая серия треков в режиме перемешивания (рабочее значение). */
  shuffleRun: number;
  /** id трека, который сейчас повторяется (чтобы сбросить серию при смене). */
  repeatTrackId: string | null;
  /**
   * Треки, за добавление в избранное которых XP уже начислен.
   *
   * Ключ — id трека, значение — когда начислили. Нужен, чтобы лайк нельзя
   * было абузить: снял лайк и поставил снова — это по-прежнему один и тот же
   * трек, и второй раз за него платить не за что. Хранится постоянно, а не
   * только на день: иначе абуз просто откладывался бы до полуночи.
   */
  favoriteXpTrackIds: Record<string, string>;
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
  /**
   * Регистрирует повтор текущего трека (режим «повтор одного»).
   *
   * Считает серию повторов ПОДРЯД: трек повторяется десять раз без
   * переключений — серия растёт. Смена трека сбрасывает её, иначе счётчик
   * копился бы за весь день и достижение теряло бы смысл.
   */
  registerRepeatLoop: (trackId: string) => void;
  /**
   * Регистрирует переход к следующему треку.
   *
   * Нужен для серии перемешивания: в режиме `shuffle` считаем подряд идущие
   * треки, в остальных режимах серия сбрасывается.
   */
  registerTrackAdvance: (trackId: string, isShuffle: boolean) => void;
  /** Запоминает источник трека (для достижения «Двойной резонанс»). */
  registerTrackSource: (source: string) => void;
  /**
   * Добавление в избранное: квест + XP за уникальный трек.
   *
   * `trackId` обязателен: без него нельзя понять, платили ли за этот трек
   * раньше, и награда снова станет абузной.
   *
   * `awardedXp` приходит от базы (0, если за трек уже награждали или достигнут
   * дневной лимит). Именно она решает, положен ли опыт, — клиент лишь
   * применяет ответ, поэтому подделать начисление через DevTools нельзя.
   */
  registerFavoriteAdded: (trackId: string, awardedXp: number) => void;
  /** Публичный плейлист с ≥10 треками: +15 XP раз в сутки. */
  registerPublicPlaylistComplete: (isPublic: boolean, trackCount: number) => void;
  /**
   * Забрать награду за квест (если выполнен и не забран).
   *
   * Асинхронный: решение о начислении принимает база, чтобы награду нельзя
   * было получить дважды. Возвращает true, если опыт действительно начислен.
   */
  claimQuest: (id: QuestId) => Promise<boolean>;
  /** Сбросить дневное состояние, если наступил новый день. */
  rolloverIfNeeded: () => void;

  // ── производные ───────────────────────────────────────────────────
  getCurrentRank: () => Rank;
  getProgress: () => RankProgress;
  getQuestProgress: (id: QuestId) => number;

  // ── синхронизация с облаком ───────────────────────────────────────
  /**
   * Подтягивает прогресс и статистику из БД (при входе).
   *
   * Возвращает `true`, если данные прочитаны. Пока это не так, писать
   * в облако нельзя: локальное состояние может быть обнулено после выхода
   * из аккаунта, и запись затрёт реальный прогресс.
   */
  hydrateFromCloud: () => Promise<boolean>;
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

/**
 * Признак того, что запись уже идёт.
 *
 * Троттлинг ограничивает ЧАСТОТУ запусков, но не мешает двум вызовам
 * наложиться: первый ещё пишет в сеть, а второй уже стартовал. Два параллельных
 * снимка прогрессии применяются в непредсказуемом порядке — более старый может
 * перезаписать более свежий. Именно это давало эффект «сохраняется через раз».
 *
 * Поэтому записи строго последовательны, а последнее состояние, пришедшее
 * во время записи, отправляется сразу после её окончания. Ожидающий вызов
 * ровно один — повторные не копятся, важно лишь «догнать» актуальное значение.
 */
let isSyncing = false;
let isResyncQueued = false;

/** Отправляет текущее состояние прогресса в облако. */
async function syncProgressionNow(): Promise<void> {
  if (!isSupabaseConfigured) return;

  if (isSyncing) {
    // Запись уже идёт: помечаем, что после неё нужен ещё один проход.
    isResyncQueued = true;
    return;
  }

  const userId = await currentUserId();
  if (!userId) return;

  isSyncing = true;

  try {
    const state = useProgressionStore.getState();
    const { daily, historyMap, totalSecondsListened, totalTracksPlayed, totalXP } =
      state;

    /*
     * Снимок прогрессии.
     *
     * Формируем ЗАРАНЕЕ и передаём один и тот же набор колонок и в запрос,
     * и в очередь повтора. Операции идемпотентны (пишут конкретные значения,
     * а не приращения), поэтому повторная отправка не задваивает счётчики,
     * и устаревший снимок не может попасть в очередь.
     */
    const rank = getRankByXp(totalXP);

    const progressionColumns = {
      xp: totalXP,
      level: getLevelByXp(totalXP),
      rank_tier: rank.tier,
      rank_name: rank.id,
      daily_date: daily.date,
      daily_listened_seconds: daily.listenedSeconds,
      daily_favorites_added: daily.favoritesAdded,
      daily_completed_tracks: daily.completedTracks,
      playlist_xp_claimed: daily.playlistXpClaimed,
    };

    /*
     * Записи идут ПОСЛЕДОВАТЕЛЬНО, а не через Promise.all.
     *
     * Два параллельных upsert'а в разные таблицы — это две конкурирующие
     * транзакции. При обрыве связи одна могла примениться, а вторая попасть
     * в очередь: состояние расходилось, и часть прогресса выглядела потерянной.
     */
    await pushProgression(userId, progressionColumns);
    await pushListeningStats({
      totalSecondsListened,
      totalTracksPlayed,
      /*
       * Число активных дней считаем как объединение всех дневных историй.
       *
       * Одного `historyMap` мало: если человек только лайкал треки, не слушая
       * музыку, день всё равно активный, а в истории прослушивания его нет.
       * Объединение даёт честное число — оно же используется для недельного
       * прогресса плитки «Дней активности».
       */
      activeDaysCount: countActiveDays(
        historyMap,
        state.tracksByDay,
        state.favoritesByDay,
      ),
      history: historyMap,
      tracksByDay: state.tracksByDay,
      favoritesByDay: state.favoritesByDay,
      nightPlays: state.counters.nightPlays,
      maxSessionSeconds: state.counters.maxSessionSeconds,
      repeatLoops: state.counters.repeatLoops,
      shuffleStreak: state.counters.shuffleStreak,
      sources: state.counters.sources,
    });
  } finally {
    isSyncing = false;

    // Во время записи накопились изменения — догоняем их.
    if (isResyncQueued) {
      isResyncQueued = false;
      void syncProgressionNow();
    }
  }
}

/**
 * Дебаунс живёт на уровне модуля, а не в сторе: он не должен попадать
 * в persist-снапшот и обязан быть общим для всех вызовов.
 */
const scheduleCloudSync = throttle(() => {
  void syncProgressionNow();
}, SYNC_INTERVAL_MS);

/**
 * Объединяет дневные истории (минуты, треки, лайки).
 *
 * По каждой дате берём большее значение: счётчики только накапливаются,
 * поэтому расхождение означает, что одно из хранилищ отстало. Складывать
 * нельзя — получилось бы задвоение.
 *
 * Функция одна на три истории (`historyMap`, `tracksByDay`, `favoritesByDay`):
 * структура у них одинаковая, отличается только смысл чисел.
 */
function mergeDailyHistory(
  local: Record<string, number>,
  cloud: Record<string, number>,
): Record<string, number> {
  const merged: Record<string, number> = { ...cloud };

  for (const [date, value] of Object.entries(local)) {
    merged[date] = Math.max(merged[date] ?? 0, value);
  }

  return merged;
}

/**
 * Считает число уникальных дней с активностью.
 *
 * Объединяет все дневные истории: человек мог в какой-то день только слушать
 * музыку, в другой — только добавлять в избранное. Каждый такой день активен,
 * поэтому берём объединение дат, а не одну из историй.
 *
 * Возвращает не только число, но и сами даты — они нужны недельному прогрессу
 * плитки «Дней активности» (сколько из семи дней текущей недели были активны).
 */
export function collectActiveDays(...histories: Record<string, number>[]): string[] {
  const days = new Set<string>();

  for (const history of histories) {
    for (const [date, value] of Object.entries(history)) {
      // Нулевые значения не считаем активностью.
      if (value > 0) days.add(date);
    }
  }

  return [...days].sort();
}

/** Число активных дней (для колонки `active_days_count`). */
function countActiveDays(...histories: Record<string, number>[]): number {
  return collectActiveDays(...histories).length;
}

/** Отправляет состояние одного задания (только прогресс). */
async function persistQuestProgress(id: QuestId): Promise<void> {
  if (!isSupabaseConfigured) return;

  const state = useProgressionStore.getState();
  await pushQuestProgress(id, state.daily.date, state.getQuestProgress(id));
}

/** Синхронизирует прогресс квеста по его текущему значению. */
async function syncQuestProgress(id: QuestId): Promise<void> {
  await persistQuestProgress(id);
}

export const useProgressionStore = create<ProgressionState>()(
  persist(
    (set, get) => ({
      totalXP: 0,
      totalSecondsListened: 0,
      totalTracksPlayed: 0,
      historyMap: {},
      tracksByDay: {},
      favoritesByDay: {},
      currentSessionSeconds: 0,
      lastTickAt: 0,
      counters: {
        nightPlays: 0,
        maxSessionSeconds: 0,
        repeatLoops: 0,
        shuffleStreak: 0,
        sources: [],
      },
      repeatRun: 0,
      shuffleRun: 0,
      repeatTrackId: null,
      favoriteXpTrackIds: {},
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

        /*
         * Сессия прослушивания.
         *
         * Тик приходит раз в секунду, пока играет музыка. Если между тиками
         * прошло больше SESSION_BREAK_SECONDS, считаем, что человек ушёл
         * и вернулся, — начинаем новую сессию. Иначе «непрерывной сессией»
         * оказалось бы всё время с открытой вкладкой.
         *
         * Берём разницу по настенным часам, а не считаем тики: вкладка в фоне
         * может троттлиться браузером, и тики приходят реже реального времени.
         */
        const now = Date.now();
        const gapSeconds =
          state.lastTickAt > 0 ? (now - state.lastTickAt) / 1000 : 0;

        const isNewSession = gapSeconds > SESSION_BREAK_SECONDS;
        const nextSessionSeconds = isNewSession
          ? seconds
          : state.currentSessionSeconds + seconds;

        set({
          totalSecondsListened: state.totalSecondsListened + seconds,
          totalXP: state.totalXP + gainedXp,
          historyMap: { ...state.historyMap, [today]: nextMinutes },
          currentSessionSeconds: nextSessionSeconds,
          lastTickAt: now,
          counters: {
            ...state.counters,
            // Рекорд: сессия либо побила предыдущий максимум, либо нет.
            maxSessionSeconds: Math.max(
              state.counters.maxSessionSeconds,
              Math.round(nextSessionSeconds),
            ),
          },
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
        const today = todayKey();
        const state = get();

        /*
         * Ночное прослушивание — для достижения «Полуночный пилигрим».
         *
         * Час берём локальный: достижение про «слушал ночью» должно совпадать
         * с тем, что человек видит на своих часах, а не с UTC.
         */
        const hour = new Date().getHours();
        const isNight = hour >= NIGHT_START_HOUR && hour < NIGHT_END_HOUR;

        set({
          totalTracksPlayed: state.totalTracksPlayed + 1,
          // Дневная история прослушанных треков — для прогресса в профиле.
          tracksByDay: {
            ...state.tracksByDay,
            [today]: (state.tracksByDay[today] ?? 0) + 1,
          },
          counters: {
            ...state.counters,
            nightPlays: isNight
              ? state.counters.nightPlays + 1
              : state.counters.nightPlays,
          },
          daily: {
            ...state.daily,
            completedTracks: state.daily.completedTracks + 1,
          },
        });

        void syncQuestProgress("nightMarathon");
        scheduleCloudSync();
      },

      registerRepeatLoop: (trackId) => {
        const state = get();

        /*
         * Серия повторов одного трека — для достижения «Одержимость».
         *
         * Если повторяется тот же трек, серия растёт. Если сменился —
         * начинаем заново с единицы: важно именно количество повторов ПОДРЯД,
         * иначе счётчик копился бы за весь день и достижение обесценилось бы.
         */
        const isSameTrack = state.repeatTrackId === trackId;
        const nextRun = isSameTrack ? state.repeatRun + 1 : 1;

        set({
          repeatRun: nextRun,
          repeatTrackId: trackId,
          counters: {
            ...state.counters,
            repeatLoops: Math.max(state.counters.repeatLoops, nextRun),
          },
        });

        scheduleCloudSync();
      },

      registerTrackAdvance: (trackId, isShuffle) => {
        const state = get();

        /*
         * Серия перемешивания — для достижения «Слепая судьба».
         *
         * ПОДРЯД идущие треки в режиме `shuffle`. При выходе из режима серия
         * обрывается — достижение про то, что человек долго слушал именно
         * вперемешку, а не про общее число переключений.
         *
         * ВАЖНО: текущая серия и рекорд — разные величины. Рекорд лежит
         * в `counters.shuffleStreak` и только растёт, а текущая серия —
         * в `shuffleRun`. Если сбрасывать общий счётчик, при выходе из режима
         * обнулялся бы и рекорд, и достижение становилось бы недостижимым.
         */
        if (!isShuffle) {
          if (state.shuffleRun === 0) return;

          // Обрываем текущую серию, рекорд не трогаем.
          set({
            shuffleRun: 0,
            repeatRun: 0,
            repeatTrackId: null,
          });
          return;
        }

        // Серия растёт, только когда трек действительно сменился.
        const isNewTrack = state.repeatTrackId !== trackId;
        const nextRun = isNewTrack ? state.shuffleRun + 1 : state.shuffleRun;

        set({
          shuffleRun: nextRun,
          counters: {
            ...state.counters,
            // Рекорд обновляем отдельно — он не сбрасывается никогда.
            shuffleStreak: Math.max(state.counters.shuffleStreak, nextRun),
          },
          // Переход к другому треку обрывает серию его повторов.
          repeatRun: isNewTrack ? 0 : state.repeatRun,
          repeatTrackId: trackId,
        });

        scheduleCloudSync();
      },

      registerTrackSource: (source) => {
        const state = get();
        if (!source) return;
        if (state.counters.sources.includes(source)) return;

        const sources = [...state.counters.sources, source];

        set({
          counters: { ...state.counters, sources },
        });

        scheduleCloudSync();
      },

      registerFavoriteAdded: (trackId, awardedXp) => {
        get().rolloverIfNeeded();

        /*
         * XP за избранное начисляется ОДИН РАЗ ЗА ТРЕК — и решает это база.
         *
         * Раньше опыт давался за каждое добавление, и это абузилось в два
         * клика: лайк (+2 XP) → снятие лайка → лайк снова (+2 XP). Дневной
         * лимит проблему не решал — он лишь ограничивал скорость: 10 XP
         * набирались пятью кликами по одному и тому же треку.
         *
         * Теперь сумму присылает база (0, если за трек уже платили), а стор
         * лишь применяет её. Локальный список `favoriteXpTrackIds` нужен как
         * быстрый фильтр, чтобы не ждать ответа сети для повторных лайков.
         *
         * Квест «Коллекционер» продолжает считать действия за день — ему
         * нужны именно добавления, а не уникальные треки.
         */
        const alreadyRewarded = Boolean(get().favoriteXpTrackIds[trackId]);
        const state = get();
        const canGainXp = awardedXp > 0 && !alreadyRewarded;
        const today = todayKey();

        set({
          totalXP: state.totalXP + (canGainXp ? awardedXp : 0),
          favoriteXpTrackIds: canGainXp
            ? { ...state.favoriteXpTrackIds, [trackId]: today }
            : state.favoriteXpTrackIds,
          // Дневная история лайков — для прогресса плитки «Любимых треков».
          favoritesByDay: {
            ...state.favoritesByDay,
            [today]: (state.favoritesByDay[today] ?? 0) + 1,
          },
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

      /**
       * Забирает награду за задание.
       *
       * Ключевой момент: решение принимает БАЗА, а не клиент.
       *
       * Раньше флаг «награда забрана» жил только в localStorage, а запись
       * уходила в фон. Перезагрузка страницы могла случиться раньше, чем
       * запрос доходил до базы: в облаке отметки не было, задание снова
       * выглядело незабранным — и опыт начислялся повторно. Так можно было
       * накручивать XP сколько угодно раз.
       *
       * Теперь клиент просит базу выдать награду (claim_quest), и та:
       *   * блокирует строку — двойной клик и две вкладки не проходят;
       *   * проверяет, что цель достигнута;
       *   * начисляет XP атомарно ровно один раз в сутки.
       *
       * Локально применяем ТОЛЬКО то, что подтвердила база: если она ответила
       * «уже забрано», опыт не начисляем, а состояние помечаем собранным —
       * так интерфейс сам себя чинит после перезагрузки.
       */
      claimQuest: async (id) => {
        get().rolloverIfNeeded();

        const state = get();
        const quest = QUESTS.find((q) => q.id === id);
        if (!quest) return false;

        // Локальная проверка — только чтобы не дёргать сеть зря.
        if (state.daily.quests[id].claimed) return false;
        if (get().getQuestProgress(id) < quest.target) return false;

        /** Помечает задание собранным локально (без начисления XP). */
        const markClaimed = () => {
          set((current) => ({
            daily: {
              ...current.daily,
              quests: { ...current.daily.quests, [id]: { claimed: true } },
            },
          }));
        };

        if (!isSupabaseConfigured) {
          // Локальный режим: база недоступна, работаем как раньше.
          set((current) => ({
            totalXP: current.totalXP + quest.rewardXP,
            daily: {
              ...current.daily,
              quests: { ...current.daily.quests, [id]: { claimed: true } },
            },
          }));
          return true;
        }

        const result = await claimQuestReward(id, state.daily.date);

        if (result.granted) {
          /*
           * Опыт берём из ответа базы, а не из своего конфига: так локальное
           * значение совпадает с облачным. Если база вернула итоговый XP,
           * доверяем ему — это защищает от расхождений при начислении
           * с другого устройства.
           */
          set((current) => ({
            totalXP:
              result.totalXp !== null
                ? Math.max(current.totalXP, result.totalXp)
                : current.totalXP + result.awardedXp,
            daily: {
              ...current.daily,
              quests: { ...current.daily.quests, [id]: { claimed: true } },
            },
          }));

          scheduleCloudSync();
          return true;
        }

        /*
         * Награда не выдана. Разбираем причины:
         *  - already_claimed: база помнит сбор, которого не помнит клиент
         *    (перезагрузка до записи) — просто синхронизируем состояние;
         *  - not_completed / no_progress: цель не подтверждена базой;
         *  - error: функция недоступна (миграция не применена) или сеть.
         *
         * В последнем случае НЕ помечаем задание собранным: иначе награда
         * потерялась бы навсегда — сначала «забрано» локально, а в базе
         * по-прежнему пусто.
         */
        if (result.reason === "already_claimed") {
          markClaimed();
        }

        return false;
      },

      getCurrentRank: () => getRankByXp(get().totalXP),
      getProgress: () => getRankProgress(get().totalXP),

      getQuestProgress: (id) => {
        const { daily } = get();
        if (id === "immersion") return Math.floor(daily.listenedSeconds / 60);
        if (id === "collector") return daily.favoritesAdded;
        return daily.completedTracks;
      },

      /**
       * Подтягивает прогресс и статистику из БД (при входе).
       *
       * Возвращает `true`, если данные действительно прочитаны. Это важно для
       * вызывающего: пока облако не прочитано, писать в него НЕЛЬЗЯ.
       *
       * Раньше метод ничего не возвращал, а при отсутствии сессии просто
       * выходил. Вызывающий не мог отличить «прочитали» от «не прочитали»,
       * продолжал синхронизацию — и записывал в базу локальное состояние,
       * которое после выхода из аккаунта было обнулено. Именно так прогресс
       * пропадал при перезаходе (было 28 XP, стало 0 в базе).
       */
      hydrateFromCloud: async (): Promise<boolean> => {
        if (!isSupabaseConfigured) return false;

        const userId = await currentUserId();
        if (!userId) {
          // Сессия ещё не установилась. Сообщаем об этом вызывающему —
          // запись в облако он должен пропустить, иначе затрёт данные.
          console.warn(
            "[sync] гидратация пропущена: сессия ещё не готова",
          );
          return false;
        }

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

          // Дневные истории объединяем: по каждой дате берём большее значение.
          patch.historyMap = mergeDailyHistory(local.historyMap, stats.history);
          patch.tracksByDay = mergeDailyHistory(
            local.tracksByDay,
            stats.tracksByDay,
          );
          patch.favoritesByDay = mergeDailyHistory(
            local.favoritesByDay,
            stats.favoritesByDay,
          );

          /*
           * Рекордные счётчики — тоже по максимуму.
           *
           * Они только растут, поэтому расхождение означает недосинхронизацию,
           * а не реальное уменьшение. Складывать нельзя: это привело бы
           * к задвоению при каждой гидратации.
           */
          patch.counters = {
            nightPlays: Math.max(
              local.counters.nightPlays,
              stats.nightPlays,
            ),
            maxSessionSeconds: Math.max(
              local.counters.maxSessionSeconds,
              stats.maxSessionSeconds,
            ),
            repeatLoops: Math.max(
              local.counters.repeatLoops,
              stats.repeatLoops,
            ),
            shuffleStreak: Math.max(
              local.counters.shuffleStreak,
              stats.shuffleStreak,
            ),
            // Список источников — объединение множеств, а не максимум.
            sources: [
              ...new Set([...local.counters.sources, ...stats.sources]),
            ],
          };
        }

        /*
         * Статусы наград берём из таблицы квестов — она авторитетнее локального
         * состояния, потому что именно она защищает от повторного сбора.
         *
         * `claimed` выставляем строго по наличию claimed_at: если база помнит
         * сбор, а клиент после перезагрузки — нет, кнопка «Забрать» не должна
         * снова стать активной.
         */
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

        /*
         * Досылаем прогресс заданий, у которых ещё нет строки в базе.
         *
         * Без строки claim_quest ответит «no_progress» и награду не выдаст:
         * функция принципиально не начисляет опыт по данным, которых не видит.
         * Так задание, выполненное офлайн, не теряет награду — прогресс
         * доедет до базы, и забрать её можно будет со следующего захода.
         */
        const known = new Set(quests.map((row) => row.quest_id));
        for (const quest of QUESTS) {
          if (known.has(quest.id)) continue;
          await syncQuestProgress(quest.id);
        }

        // Данные прочитаны — с этого момента писать в облако безопасно.
        return true;
      },

      flushToCloud: async () => {
        /*
         * Гасим отложенный вызов и пишем немедленно: метод вызывается при
         * уходе со страницы и выходе из аккаунта, когда ждать окно троттлинга
         * нельзя.
         *
         * Если запись уже идёт, syncProgressionNow не отбросит наше намерение,
         * а запомнит его и выполнит сразу после текущей — поэтому ожидание
         * ниже действительно дожидается отправки актуального состояния.
         */
        scheduleCloudSync.cancel();
        await syncProgressionNow();

        // Догоняющий проход мог быть поставлен в очередь уже после нашего
        // await — даём ему завершиться, иначе при выходе из аккаунта запись
        // осталась бы в полёте, а сессия уже погашена.
        while (isSyncing || isResyncQueued) {
          await new Promise((resolve) => window.setTimeout(resolve, 50));
        }
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
          tracksByDay: {},
          favoritesByDay: {},
          currentSessionSeconds: 0,
          lastTickAt: 0,
          counters: {
            nightPlays: 0,
            maxSessionSeconds: 0,
            repeatLoops: 0,
            shuffleStreak: 0,
            sources: [],
          },
          repeatRun: 0,
          shuffleRun: 0,
          repeatTrackId: null,
          favoriteXpTrackIds: {},
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
        tracksByDay: state.tracksByDay,
        favoritesByDay: state.favoritesByDay,
        /*
         * Рекордные счётчики переживают перезагрузку.
         *
         * Без этого достижения «за час непрерывного прослушивания» или
         * «десять повторов подряд» обнулялись бы при каждом F5, и получить
         * их было бы почти невозможно. Плюс они нужны для прогресс-баров.
         *
         * Саму сессию (`currentSessionSeconds`) сохраняем тоже — иначе
         * обновление страницы посреди долгого прослушивания разрывало бы
         * серию. `lastTickAt` хранится вместе с ней и защищает от накрутки:
         * после долгой паузы сессия начнётся заново.
         */
        currentSessionSeconds: state.currentSessionSeconds,
        lastTickAt: state.lastTickAt,
        counters: state.counters,
        repeatRun: state.repeatRun,
        shuffleRun: state.shuffleRun,
        repeatTrackId: state.repeatTrackId,
        // Список оплаченных лайков обязан переживать перезагрузку: иначе
        // после F5 защита от абуза сбрасывалась бы вместе с ним.
        favoriteXpTrackIds: state.favoriteXpTrackIds,
        daily: state.daily,
      }),
    },
  ),
);
