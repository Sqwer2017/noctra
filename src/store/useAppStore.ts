import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Locale, LanguagePreference } from "../i18n";
import { detectBrowserLocale, resolvePreference } from "../i18n";

import type { UserProfile, UserProfileInput } from "../types/profile";
import { DEMO_PROFILE_ID, nickToHandle } from "../lib/profile";
import { profileRepository } from "../lib/repository";
import { isSupabaseConfigured } from "../lib/supabase";
import { currentUserId } from "../lib/supabase/sync";
import type { AccentPresetId } from "../theme/accents";
import { DEFAULT_ACCENT } from "../theme/accents";

type AppState = {
  // ── язык ──────────────────────────────────────────────────────────
  languagePreference: LanguagePreference;
  resolvedLocale: Locale;
  setLanguagePreference: (pref: LanguagePreference) => void;

  // ── акцентная тема ────────────────────────────────────────────────
  accentPreset: AccentPresetId;
  accentCustomColor: string;
  setAccentPreset: (preset: AccentPresetId) => void;
  setAccentCustomColor: (color: string) => void;

  // ── текущий профиль ────────────────────────────────────────────────
  profile: UserProfile | null;
  /** id залогиненного пользователя: auth.uid() в облаке, демо-id локально. */
  userId: string;
  isProfileReady: boolean;

  /**
   * Пользователь вошёл как гость (анонимная сессия Supabase).
   *
   * Гость — это не то же самое, что локальный режим: сессия есть, данные
   * синхронизируются, но аккаунт не привязан к почте и его нельзя перенести
   * на другое устройство. UI показывает такому пользователю кнопку «Войти».
   */
  isGuest: boolean;
  setIsGuest: (value: boolean) => void;

  loadCurrentUser: (nick?: string) => Promise<void>;
  updateProfile: (input: UserProfileInput) => Promise<void>;
};

const AUTO_KEY = "notra.language";

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      languagePreference: "auto",
      resolvedLocale: detectBrowserLocale(), // первичное значение до гидратации

      setLanguagePreference: (pref) => {
        set({
          languagePreference: pref,
          resolvedLocale: resolvePreference(pref),
        });
      },

      accentPreset: DEFAULT_ACCENT,
      accentCustomColor: "#a855f7",
      setAccentPreset: (preset) => set({ accentPreset: preset }),
      setAccentCustomColor: (color) =>
        set({ accentCustomColor: color, accentPreset: "custom" }),

      profile: null,
      userId: DEMO_PROFILE_ID,
      isProfileReady: false,

      isGuest: false,
      setIsGuest: (value) => set({ isGuest: value }),

      loadCurrentUser: async (nick) => {
        // В облачном режиме id берём из активной сессии Supabase.
        // Локальный режим работает на демо-id, как и раньше.
        const userId = isSupabaseConfigured
          ? ((await currentUserId()) ?? DEMO_PROFILE_ID)
          : DEMO_PROFILE_ID;

        let profile = await profileRepository.getByUserId(userId);

        // Регистрирующийся юзер: создаём профиль с ником с экрана регистрации.
        if (!profile && nick) {
          profile = await profileRepository.create({ userId, nick });
        }

        set({ userId, profile, isProfileReady: true });
      },

      updateProfile: async (input) => {
        const previous = get().profile;

        // Оптимистично: применяем изменения локально сразу, чтобы интерфейс
        // не ждал сети. Рекомендации/аватарка появляются мгновенно.
        if (previous) {
          const optimistic: UserProfile = { ...previous, ...input };
          if (input.nick && !input.handle) {
            optimistic.handle = nickToHandle(input.nick);
          }
          set({ profile: optimistic });
        }

        try {
          const profile = await profileRepository.update(get().userId, input);
          set({ profile });
        } catch (error) {
          // Откат: показать «сохранено» и потерять данные хуже, чем вернуть
          // предыдущее состояние и честно сообщить об ошибке.
          console.warn("[profile] не удалось сохранить изменения:", error);
          set({ profile: previous });
          throw error;
        }
      },
    }),
    {
      name: AUTO_KEY,
      partialize: (state) => ({
        languagePreference: state.languagePreference,
        accentPreset: state.accentPreset,
        accentCustomColor: state.accentCustomColor,
      }),
      onRehydrateStorage: () => (state) => {
        // после гидратации из localStorage пересчитываем фактический язык
        if (state) {
          state.resolvedLocale = resolvePreference(state.languagePreference);
        }
      },
    },
  ),
);

export function useCurrentLocale(): Locale {
  return useAppStore((s) => s.resolvedLocale);
}
