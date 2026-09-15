/**
 * Система рангов и XP.
 *
 * XP — накопительный счётчик (localStorage через useProgressionStore):
 *  - 1 XP за каждые 5 минут (300 секунд) прослушивания;
 *  - +2 XP за добавление трека в избранное (макс. 10 раз в день);
 *  - +15 XP за создание публичного плейлиста с ≥10 треками (раз в сутки);
 *  - награды за ежедневные задания.
 *
 * Ранг определяется по порогу XP. Иконки рангов лежат в /public/ranks/N.png
 * (1..8). Если файла нет — UI покажет встроенную SVG-эмблему (fallback).
 */

export type RankId =
  | "base"
  | "medium"
  | "advanced"
  | "high"
  | "saint"
  | "king"
  | "emperor"
  | "god";

export type Rank = {
  id: RankId;
  /** Номер уровня 1..8 (используется и для иконки /ranks/{tier}.png). */
  tier: number;
  /** Порог XP для достижения ранга. */
  minXp: number;
  /** i18n-ключ названия. */
  labelKey: string;
  /** Путь к PNG-иконке ранга (public/ranks). */
  icon: string;
};

export const RANKS: Rank[] = [
  { id: "base", tier: 1, minXp: 0, labelKey: "rank.base", icon: "/ranks/1.png" },
  { id: "medium", tier: 2, minXp: 500, labelKey: "rank.medium", icon: "/ranks/2.png" },
  { id: "advanced", tier: 3, minXp: 1200, labelKey: "rank.advanced", icon: "/ranks/3.png" },
  { id: "high", tier: 4, minXp: 2000, labelKey: "rank.high", icon: "/ranks/4.png" },
  { id: "saint", tier: 5, minXp: 2850, labelKey: "rank.saint", icon: "/ranks/5.png" },
  { id: "king", tier: 6, minXp: 3900, labelKey: "rank.king", icon: "/ranks/6.png" },
  { id: "emperor", tier: 7, minXp: 5000, labelKey: "rank.emperor", icon: "/ranks/7.png" },
  { id: "god", tier: 8, minXp: 7000, labelKey: "rank.god", icon: "/ranks/8.png" },
];

/** XP за каждые 5 минут прослушивания. */
export const XP_PER_LISTEN_SECONDS = 300;
export const XP_PER_FAVORITE = 2;
export const XP_PER_PLAYLIST = 15;
export const FAVORITE_XP_DAILY_CAP = 10;
export const PLAYLIST_MIN_TRACKS = 10;

/** Считает XP из прослушанного времени (для отображения/начисления). */
export function listeningXp(listenedSeconds: number): number {
  return Math.floor(Math.max(0, listenedSeconds) / XP_PER_LISTEN_SECONDS);
}

/**
 * Уровень для колонки `profiles.level` в Supabase.
 *
 * В приложении шкала прогрессии задана рангами (8 порогов XP), отдельных
 * уровней нет. Чтобы не заводить вторую конкурирующую шкалу, за уровень берём
 * номер ранга (1..8): тогда `level` всегда согласован с `rank_tier`, и UI
 * может читать любое из двух полей без расхождений.
 */
export function getLevelByXp(xp: number): number {
  return getRankByXp(xp).tier;
}

/** Текущий ранг по XP. */
export function getRankByXp(xp: number): Rank {
  let current = RANKS[0];
  for (const rank of RANKS) {
    if (xp >= rank.minXp) current = rank;
    else break;
  }
  return current;
}

/** Следующий ранг (или null, если достигнут максимальный). */
export function getNextRank(xp: number): Rank | null {
  return RANKS.find((rank) => rank.minXp > xp) ?? null;
}

export type RankProgress = {
  xp: number;
  rank: Rank;
  nextRank: Rank | null;
  /** XP, набранный внутри текущего ранга. */
  xpIntoRank: number;
  /** Сколько XP нужно набрать внутри текущего ранга до следующего. */
  xpForRank: number;
  /** Процент прогресса к следующему рангу (0..100). */
  percent: number;
  /** Осталось XP до следующего ранга. */
  xpToNext: number;
};

export function getRankProgress(xp: number): RankProgress {
  const rank = getRankByXp(xp);
  const nextRank = getNextRank(xp);

  if (!nextRank) {
    return {
      xp,
      rank,
      nextRank: null,
      xpIntoRank: xp - rank.minXp,
      xpForRank: 0,
      percent: 100,
      xpToNext: 0,
    };
  }

  const range = nextRank.minXp - rank.minXp;
  const xpIntoRank = xp - rank.minXp;
  const percent = range > 0 ? Math.min(100, Math.round((xpIntoRank / range) * 100)) : 0;

  return {
    xp,
    rank,
    nextRank,
    xpIntoRank,
    xpForRank: range,
    percent,
    xpToNext: Math.max(0, nextRank.minXp - xp),
  };
}
