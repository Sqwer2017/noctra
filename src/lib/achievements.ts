/**
 * Каталог достижений на клиенте.
 *
 * Здесь живёт то, чего не может быть в базе: человекочитаемые ключи
 * переводов и путь к иконке. Техническая часть (условие и порог выдачи)
 * лежит в SQL — там же и сама выдача, поэтому подделать её нельзя.
 *
 * Иконки — PNG в /public/achievements, отрисованные автором проекта.
 */

export type AchievementRarity = "common" | "rare" | "epic" | "legendary";

export type AchievementDef = {
  /** Совпадает с `achievements.id` в базе. */
  id: string;
  /** Ключ названия в i18n (`achievement.<id>`). */
  titleKey: string;
  /** Путь к иконке (файл в /public/achievements). */
  icon: string;
  rarity: AchievementRarity;
  /**
   * Числовая цель для прогресс-бара, если условие измеримое.
   * `null` — достижение событийное (например, «прослушать ночью»),
   * для него полоса прогресса не показывается.
   */
  target: number | null;
  /**
   * Какое поле прогресса показывает полосу.
   * Совпадает с `condition_kind` в базе — так клиент знает, что рисовать.
   */
  metric:
    | "tracks_total"
    | "favorites_total"
    | "playlists_total"
    | "playlist_tracks"
    | "streak_days"
    | "quests_claimed"
    | "night_plays"
    | "session_seconds"
    | "repeat_loops"
    | "shuffle_streak"
    | "max_rank"
    | "dual_source"
    | "album_complete"
    | "profile_complete";
};

/**
 * Порядок массива = порядок плиток в профиле.
 * Совпадает с `sort_order` в миграции 005.
 */
export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "first_echo",
    titleKey: "achievement.first_echo",
    icon: "/achievements/The First Echo.png",
    rarity: "common",
    metric: "tracks_total",
    target: 1,
  },
  {
    id: "initiated_darkness",
    titleKey: "achievement.initiated_darkness",
    icon: "/achievements/Initiated into Darkness.png",
    rarity: "common",
    metric: "tracks_total",
    target: 100,
  },
  {
    id: "ether_keeper",
    titleKey: "achievement.ether_keeper",
    icon: "/achievements/Guardian of the Ether.png",
    rarity: "rare",
    metric: "tracks_total",
    target: 500,
  },
  {
    id: "abyss_architect",
    titleKey: "achievement.abyss_architect",
    icon: "/achievements/Architect of the Abyss.png",
    rarity: "epic",
    metric: "tracks_total",
    target: 1000,
  },
  {
    id: "resonance_lord",
    titleKey: "achievement.resonance_lord",
    icon: "/achievements/Master of Resonance.png",
    rarity: "legendary",
    metric: "tracks_total",
    target: 5000,
  },
  {
    id: "midnight_pilgrim",
    titleKey: "achievement.midnight_pilgrim",
    icon: "/achievements/Midnight Pilgrim.png",
    rarity: "rare",
    metric: "night_plays",
    target: null,
  },
  {
    id: "deep_dive",
    titleKey: "achievement.deep_dive",
    icon: "/achievements/Deep Dive.png",
    rarity: "rare",
    metric: "session_seconds",
    target: 10_800,
  },
  {
    id: "void_whisper",
    titleKey: "achievement.void_whisper",
    icon: "/achievements/Whisper of the Void.png",
    rarity: "epic",
    metric: "album_complete",
    target: null,
  },
  {
    id: "obsession",
    titleKey: "achievement.obsession",
    icon: "/achievements/Obsession.png",
    rarity: "rare",
    metric: "repeat_loops",
    target: 10,
  },
  {
    id: "blind_fate",
    titleKey: "achievement.blind_fate",
    icon: "/achievements/Blind Fate.png",
    rarity: "epic",
    metric: "shuffle_streak",
    target: 50,
  },
  {
    id: "black_pearl",
    titleKey: "achievement.black_pearl",
    icon: "/achievements/Black Pearl.png",
    rarity: "common",
    metric: "favorites_total",
    target: 1,
  },
  {
    id: "secret_archive",
    titleKey: "achievement.secret_archive",
    icon: "/achievements/Secret Archive.png",
    rarity: "rare",
    metric: "favorites_total",
    target: 100,
  },
  {
    id: "shadow_curator",
    titleKey: "achievement.shadow_curator",
    icon: "/achievements/Curator of Shadows.png",
    rarity: "common",
    metric: "playlists_total",
    target: 1,
  },
  {
    id: "grand_grimoire",
    titleKey: "achievement.grand_grimoire",
    icon: "/achievements/The Grand Grimoire.png",
    rarity: "epic",
    metric: "playlist_tracks",
    target: 50,
  },
  {
    id: "double_resonance",
    titleKey: "achievement.double_resonance",
    icon: "/achievements/Double resonance.png",
    rarity: "rare",
    metric: "dual_source",
    target: null,
  },
  {
    id: "continuous_trance",
    titleKey: "achievement.continuous_trance",
    icon: "/achievements/Continuous trance.png",
    rarity: "rare",
    metric: "streak_days",
    target: 7,
  },
  {
    id: "eternal_wanderer",
    titleKey: "achievement.eternal_wanderer",
    icon: "/achievements/Eternal Wanderer.png",
    rarity: "legendary",
    metric: "streak_days",
    target: 30,
  },
  {
    id: "self_awareness",
    titleKey: "achievement.self_awareness",
    icon: "/achievements/Self-awareness.png",
    rarity: "epic",
    metric: "profile_complete",
    target: null,
  },
  {
    id: "sound_alchemist",
    titleKey: "achievement.sound_alchemist",
    icon: "/achievements/Alchemist of Sound.png",
    rarity: "epic",
    metric: "quests_claimed",
    target: 10,
  },
  {
    id: "ruler_of_noctra",
    titleKey: "achievement.ruler_of_noctra",
    icon: "/achievements/Ruler of Noctra.png",
    rarity: "legendary",
    metric: "max_rank",
    target: 8,
  },
];

/** Общее число достижений — для счётчика «открыто N из M». */
export const ACHIEVEMENTS_TOTAL = ACHIEVEMENTS.length;

/**
 * Сила свечения плитки по редкости.
 * Легендарные светятся заметно ярче обычных — это визуальная награда.
 */
export const RARITY_GLOW: Record<AchievementRarity, number> = {
  common: 0.25,
  rare: 0.45,
  epic: 0.7,
  legendary: 1,
};

/** Шкала редкости для сортировки/подписи. */
export const RARITY_ORDER: AchievementRarity[] = [
  "common",
  "rare",
  "epic",
  "legendary",
];

/** Текущие показатели пользователя для расчёта прогресса. */
export type AchievementMetrics = {
  tracksTotal: number;
  favoritesTotal: number;
  playlistsTotal: number;
  playlistTracks: number;
  streakDays: number;
  questsClaimed: number;
  rankTier: number;
};

/** Возвращает текущее значение метрики для конкретного достижения. */
export function getMetricValue(
  achievement: AchievementDef,
  metrics: AchievementMetrics,
): number {
  switch (achievement.metric) {
    case "tracks_total":
      return metrics.tracksTotal;
    case "favorites_total":
      return metrics.favoritesTotal;
    case "playlists_total":
      return metrics.playlistsTotal;
    case "playlist_tracks":
      return metrics.playlistTracks;
    case "streak_days":
      return metrics.streakDays;
    case "quests_claimed":
      return metrics.questsClaimed;
    case "max_rank":
      return metrics.rankTier;
    default:
      // Событийные достижения прогресса не показывают.
      return 0;
  }
}

/**
 * Прогресс достижения в процентах (0..100).
 * Для событийных условий возвращает `null` — полосу рисовать не нужно.
 */
export function getAchievementProgress(
  achievement: AchievementDef,
  metrics: AchievementMetrics,
  isUnlocked: boolean,
): number | null {
  if (isUnlocked) return 100;
  if (achievement.target === null || achievement.target <= 0) return null;

  const value = getMetricValue(achievement, metrics);
  return Math.min(100, Math.round((value / achievement.target) * 100));
}
