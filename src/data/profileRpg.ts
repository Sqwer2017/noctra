import {
  AudioWaveform,
  Compass,
  Crown,
  Disc3,
  Flame,
  Headphones,
  Hourglass,
  Lock,
  MoonStar,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * RPG-данные профиля (dark fantasy / gamification).
 *
 * Сейчас это моковые данные для дашборда. Типы и структура заложены так,
 * чтобы позже заменить константы на реальные значения из БД (Supabase):
 *  - уровень/XP/ранг → таблица `profile_progress`;
 *  - статистика/тренды → агрегаты `listening_stats`;
 *  - heatmap → `listening_heatmap(date, intensity)`;
 *  - достижения → `achievements` + `user_achievements(unlocked, rarity)`.
 */

export type StatTrend = {
  value: number;
  direction: "up" | "down";
};

export type AchievementRarity = "common" | "rare" | "epic" | "legendary";

export type Achievement = {
  id: string;
  titleKey: string;
  icon: LucideIcon;
  unlocked: boolean;
  rarity: AchievementRarity;
};

export type HeatmapIntensity = 0 | 1 | 2 | 3 | 4;

export type HeatmapDay = {
  /** ISO-дата (YYYY-MM-DD). */
  date: string;
  intensity: HeatmapIntensity;
};

/** TODO(db): заменить на агрегаты listening_stats. */
export const profileStats = {
  trends: {
    hours: { value: 12, direction: "up" } as StatTrend,
    tracksPlayed: { value: 8, direction: "up" } as StatTrend,
    likedTracks: { value: 15, direction: "up" } as StatTrend,
    activeDays: { value: 6, direction: "up" } as StatTrend,
  },
};

/** TODO(db): заменить на user_achievements. */
export const profileAchievements: Achievement[] = [
  {
    id: "music-mage",
    titleKey: "profile.ach.musicMage",
    icon: Headphones,
    unlocked: true,
    rarity: "rare",
  },
  {
    id: "night-listener",
    titleKey: "profile.ach.nightListener",
    icon: MoonStar,
    unlocked: true,
    rarity: "epic",
  },
  {
    id: "track-collector",
    titleKey: "profile.ach.collector",
    icon: Disc3,
    unlocked: true,
    rarity: "common",
  },
  {
    id: "immersion",
    titleKey: "profile.ach.immersion",
    icon: AudioWaveform,
    unlocked: true,
    rarity: "rare",
  },
  {
    id: "playlist-legend",
    titleKey: "profile.ach.playlistLegend",
    icon: Crown,
    unlocked: true,
    rarity: "legendary",
  },
  {
    id: "explorer",
    titleKey: "profile.ach.explorer",
    icon: Compass,
    unlocked: true,
    rarity: "common",
  },
  {
    id: "sleepless",
    titleKey: "profile.ach.sleepless",
    icon: Hourglass,
    unlocked: true,
    rarity: "rare",
  },
  {
    id: "eternal-fan",
    titleKey: "profile.ach.eternalFan",
    icon: Flame,
    unlocked: true,
    rarity: "epic",
  },
  {
    id: "locked-mystery",
    titleKey: "profile.ach.locked",
    icon: Lock,
    unlocked: false,
    rarity: "legendary",
  },
];

export const achievementsUnlocked = profileAchievements.filter(
  (a) => a.unlocked,
).length;
export const achievementsTotal = 32;
