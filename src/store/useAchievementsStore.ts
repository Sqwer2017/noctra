import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createSafeStorage } from "../lib/safeStorage";

import { ACHIEVEMENTS, ACHIEVEMENTS_TOTAL } from "../lib/achievements";
import type { AchievementDef, AchievementMetrics } from "../lib/achievements";
import { isSupabaseConfigured } from "../lib/supabase";
import {
  fetchUnlockedAchievements,
  requestAchievementCheck,
} from "../lib/supabase/achievements";

/**
 * Состояние достижений.
 *
 * Отдельный стор, а не поле в прогрессии: достижения приходят из базы
 * асинхронно и живут своей жизнью (загрузка, обновление, уведомления).
 * Смешивать их с XP и статистикой было бы тесно.
 *
 * Персистится только `seen`: список тех достижений, о которых пользователю
 * уже сообщили. Без него уведомление показывалось при КАЖДОМ заходе —
 * база отдаёт весь список открытых, клиент сравнивал его с пустым состоянием
 * после перезагрузки и считал все достижения «новыми». Сами открытые
 * достижения не персистятся: их источник правды — база.
 */

type AchievementsState = {
  /** Коды открытых достижений. */
  unlocked: string[];
  /**
   * Достижения, о которых пользователю уже сообщили.
   *
   * Именно этот список, а не `unlocked`, определяет, показывать ли
   * уведомление: он переживает перезагрузку.
   */
  seen: string[];
  /** Идёт загрузка из базы. */
  isLoading: boolean;
  /** Развёрнут ли полный список достижений в профиле. */
  isExpanded: boolean;
  setExpanded: (value: boolean) => void;
  /**
   * Очередь на показ уведомлений.
   *
   * Заполняется, когда появляются новые достижения: их нужно показать
   * по одному, красиво, а не все разом.
   */
  pendingNotifications: string[];

  /** Загружает достижения пользователя. */
  load: () => Promise<void>;
  /** Пересчитывает достижения на стороне базы и подтягивает результат. */
  refresh: () => Promise<void>;
  /** Вызывается после показа уведомления. */
  dismissNotification: () => void;
  /** Очистка при выходе из аккаунта. */
  reset: () => void;
};

export const useAchievementsStore = create<AchievementsState>()(
  persist(
    (set, get) => ({
      unlocked: [],
      seen: [],
      isLoading: false,
      isExpanded: false,
      pendingNotifications: [],

      setExpanded: (value) => set({ isExpanded: value }),

      load: async () => {
        if (!isSupabaseConfigured) return;

        set({ isLoading: true });

        try {
          const ids = await fetchUnlockedAchievements();
          set({ unlocked: ids });
        } finally {
          set({ isLoading: false });
        }
      },

      refresh: async () => {
        if (!isSupabaseConfigured) return;

        // Просим базу пересчитать условия, затем читаем актуальный список.
        await requestAchievementCheck();

        const ids = await fetchUnlockedAchievements();

        /*
         * «Новое» = открыто в базе, но о нём ещё не сообщали.
         *
         * Первый вход (seen пуст) — исключение: молча помечаем всё уже
         * открытое как показанное, иначе человек при первом заходе получил бы
         * двадцать уведомлений подряд о достижениях, которые заработал раньше.
         * Награда за них уже получена, сообщать не о чем — эффект был бы
         * обратным: не праздник, а спам.
         */
        const seen = get().seen;
        const seenSet = new Set(seen);

        if (seenSet.size === 0 && ids.length > 0) {
          set({ unlocked: ids, seen: ids });
          return;
        }

        const fresh = ids.filter((id) => !seenSet.has(id));

        set({
          unlocked: ids,
          // Помечаем показанными СРАЗУ, не дожидаясь закрытия тоста: иначе
          // перезагрузка во время показа вернула бы уведомление снова.
          seen: fresh.length > 0 ? [...seen, ...fresh] : seen,
          pendingNotifications:
            fresh.length > 0
              ? [...get().pendingNotifications, ...fresh]
              : get().pendingNotifications,
        });
      },

      dismissNotification: () =>
        set((state) => ({
          pendingNotifications: state.pendingNotifications.slice(1),
        })),

      reset: () =>
        set({
          unlocked: [],
          seen: [],
          pendingNotifications: [],
          isLoading: false,
        }),
    }),
    {
      name: "noctra.achievements",
      storage: createSafeStorage(),
      /*
       * Храним только `seen` и состояние раскрытия списка.
       * `unlocked` намеренно не персистим: после смены аккаунта в кэше
       * остались бы чужие достижения, а источник правды — база.
       */
      partialize: (state) => ({
        seen: state.seen,
        isExpanded: state.isExpanded,
      }),
    },
  ),
);

/** Открыто ли конкретное достижение. */
export function useIsAchievementUnlocked(id: string): boolean {
  return useAchievementsStore((state) => state.unlocked.includes(id));
}

/** Сводка: сколько открыто из общего числа. */
export function useAchievementsSummary(): {
  unlockedCount: number;
  total: number;
} {
  const unlockedCount = useAchievementsStore((state) => state.unlocked.length);

  return { unlockedCount, total: ACHIEVEMENTS_TOTAL };
}

/** Каталог достижений с флагом открытия — для сетки в профиле. */
export function useAchievementsWithState(): Array<
  AchievementDef & { isUnlocked: boolean }
> {
  const unlocked = useAchievementsStore((state) => state.unlocked);
  const unlockedSet = new Set(unlocked);

  return ACHIEVEMENTS.map((achievement) => ({
    ...achievement,
    isUnlocked: unlockedSet.has(achievement.id),
  }));
}

/** Метрики для расчёта прогресс-баров (передаются из компонента). */
export type { AchievementMetrics };
