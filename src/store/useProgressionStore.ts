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
      activeDaysCount: Object.keys(historyMap).length,
      history: historyMap,
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

        set({
          totalXP: state.totalXP + (canGainXp ? awardedXp : 0),
          favoriteXpTrackIds: canGainXp
            ? { ...state.favoriteXpTrackIds, [trackId]: todayKey() }
            : state.favoriteXpTrackIds,
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

          // Историю по дням объединяем: по каждой дате берём большее значение.
          patch.historyMap = mergeHistory(local.historyMap, stats.history);
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
        // Список оплаченных лайков обязан переживать перезагрузку: иначе
        // после F5 защита от абуза сбрасывалась бы вместе с ним.
        favoriteXpTrackIds: state.favoriteXpTrackIds,
        daily: state.daily,
      }),
    },
  ),
);
