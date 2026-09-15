import { create } from "zustand";

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
 * Не персистится: источник правды — база, а локальная копия нужна только
 * на время сессии. Иначе после смены аккаунта остались бы чужие достижения.
 */

type AchievementsState = {
  /** Коды открытых достижений. */
  unlocked: string[];
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

export const useAchievementsStore = create<AchievementsState>()((set, get) => ({
  unlocked: [],
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

    const previous = get().unlocked;
    const ids = await fetchUnlockedAchievements();

    // Новые достижения ставим в очередь на показ.
    const previousSet = new Set(previous);
    const fresh = ids.filter((id) => !previousSet.has(id));

    set({
      unlocked: ids,
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
    set({ unlocked: [], pendingNotifications: [], isLoading: false }),
}));

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
