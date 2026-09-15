import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { Locale, LanguagePreference } from "../i18n";
import { detectBrowserLocale, resolvePreference } from "../i18n";

import type { UserProfile, UserProfileInput } from "../types/profile";
import {
  DEMO_PROFILE_ID,
  profileRepository,
} from "../lib/profile";
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

  // ── текущий (демо-)профиль ─────────────────────────────────────────
  profile: UserProfile | null;
  /** Уникальный локальный id «залогиненного» пользователя. */
  userId: string;
  isProfileReady: boolean;
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

      loadCurrentUser: async (nick) => {
        const userId = DEMO_PROFILE_ID;
        let profile = await profileRepository.getByUserId(userId);

        // Регистрирующийся юзер: создаём профиль с ником с экрана регистрации.
        if (!profile && nick) {
          profile = await profileRepository.create({ userId, nick });
        }

        set({ userId, profile, isProfileReady: true });
      },

      updateProfile: async (input) => {
        const profile = await profileRepository.update(
          get().userId,
          input,
        );
        set({ profile });
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
