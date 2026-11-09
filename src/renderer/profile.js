/* ═══════════════════════════════════════════════════════════════════════
   Riff — profile page
   -----------------------------------------------------------------------
   Noctra-style profile dashboard reimplemented for Riff's vanilla JS /
   Material 3 shell. Everything is local-first: profile fields, XP,
   listening time, achievements and daily quests live in localStorage.
   The module is intentionally isolated from app.js; the only bridge is
   window.RiffProfileBridge (playback, library and account fields).
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const STORAGE_KEY = 'riff_profile_v1';
  const PROFILE_VERSION = 1;
  const ACHIEVEMENT_PATH = '../../assets/profile/achievements/';
  const RANK_PATH = '../../assets/profile/ranks/';
  const BANNER_EFFECTS = [
    { id: '', label: 'Без эффекта' },
    { id: 'stars', label: 'Звёзды' },
    { id: 'fog', label: 'Туман' },
    { id: 'aurora', label: 'Аврора' },
    { id: 'embers', label: 'Угли' },
  ];

  const XP_PER_LISTEN_SECONDS = 300;
  const XP_PER_FAVORITE = 2;
  const XP_PER_PLAYLIST = 15;
  const PLAYLIST_MIN_TRACKS = 10;
  const ACTIVE_DAYS_PER_WEEK = 7;
  const SESSION_BREAK_SECONDS = 300;
  const NIGHT_START_HOUR = 0;
  const NIGHT_END_HOUR = 6;

  /* ── tiny utilities ─────────────────────────────────────────────────── */

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[char]);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function todayKey(date) {
    const d = date || new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function localDateKey(date) {
    return todayKey(date);
  }

  function shiftDays(date, days) {
    const next = new Date(date);
    next.setDate(date.getDate() + days);
    return next;
  }

  function startOfWeek(date) {
    const dayIndex = (date.getDay() + 6) % 7;
    const start = new Date(date);
    start.setDate(date.getDate() - dayIndex);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  function secondsUntilTomorrow(now) {
    const current = now || new Date();
    const next = new Date(current);
    next.setHours(24, 0, 0, 0);
    return Math.max(0, Math.floor((next.getTime() - current.getTime()) / 1000));
  }

  function formatCountdown(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function formatClock(seconds) {
    const safe = Math.max(0, Math.floor(Number(seconds) || 0));
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString();
  }

  function initialOf(value) {
    const match = String(value || '').trim().match(/[\p{L}\p{N}]/u);
    return match ? match[0].toUpperCase() : 'U';
  }

  function normalizeHandle(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const withoutAt = raw.replace(/^@+/, '').replace(/\s+/g, '');
    return withoutAt ? `@${withoutAt}` : '';
  }

  function normalizeTrack(track) {
    if (!track || typeof track !== 'object') return null;

    let duration = Number(track.duration);
    if (!Number.isFinite(duration) && typeof track.duration === 'string') {
      const parts = track.duration.split(':').map((part) => Number(part));
      if (parts.length >= 2 && parts.every((part) => Number.isFinite(part))) {
        duration = parts.length === 3
          ? parts[0] * 3600 + parts[1] * 60 + parts[2]
          : parts[0] * 60 + parts[1];
      }
    }

    return {
      id: String(track.id || track.videoId || `${track.artist || ''}::${track.title || ''}`),
      title: String(track.title || 'Unknown track'),
      artist: String(track.artist || track.channel || 'Unknown artist'),
      album: String(track.album || ''),
      cover: String(track.thumbnail || track.cover || track.coverUrl || track.image || track.artwork || ''),
      source: String(track.platform || track.source || 'Noctra'),
      duration: Number.isFinite(duration) && duration > 0 ? duration : 0,
    };
  }

  /* ── icons (inline, no extra dependency) ────────────────────────────── */

  const ICONS = {
    back: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    pencil: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    shield: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg>',
    headphones: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>',
    play: '<svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21"/></svg>',
    pause: '<svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
    prev: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="19 20 9 12 19 4"/><rect x="5" y="4" width="2" height="16" rx="1"/></svg>',
    next: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20"/><rect x="17" y="4" width="2" height="16" rx="1"/></svg>',
    shuffle: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/></svg>',
    repeat: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>',
    info: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    gift: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9"/><path d="M12 8v13"/><path d="M7.5 8a2.5 2.5 0 1 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 1 1 0 5"/></svg>',
    clock: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    check: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    music: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
    sparkles: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="M19 15v3"/><path d="M20.5 16.5h-3"/></svg>',
    trend: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/></svg>',
    image: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-4.5-4.5L6 21"/></svg>',
  };

  /* ── translations ───────────────────────────────────────────────────── */

  const STRINGS = {
    en: {
      'nav.profile': 'Profile',
      'top.back': 'Back',
      'hero.edit': 'Edit profile',
      'edit.title': 'Edit profile',
      'edit.nick': 'Nickname',
      'edit.handle': 'Handle (@)',
      'edit.status': 'Status',
      'edit.bio': 'Bio',
      'edit.cover': 'Change banner',
      'edit.avatar': 'Change avatar',
      'edit.save': 'Save',
      'edit.cancel': 'Cancel',
      'edit.remove': 'Remove',
      'edit.nickRequired': 'Nickname cannot be empty.',
      'edit.pickUnavailable': 'Image picker is unavailable.',
      'now.title': 'Now playing',
      'now.empty': 'Nothing playing',
      'now.pick': 'Play a track to see it here',
      'now.queue': 'Up next',
      'now.emptyQueue': 'Queue is empty',
      'now.shuffle': 'Shuffle',
      'now.previous': 'Previous',
      'now.next': 'Next',
      'now.repeat': 'Repeat',
      'now.play': 'Play',
      'modal.close': 'Close',
      'level.label': 'Level',
      'level.next': 'Next rank',
      'level.max': 'Max rank',
      'level.remaining': '+{xp} XP',
      'level.range': '{current} / {total} XP',
      'stats.title': 'Overall statistics',
      'stats.listening': 'Listening time',
      'stats.tracks': 'Tracks played',
      'stats.likes': 'Liked tracks',
      'stats.activeDays': 'Active days',
      'stats.periodToday': 'Change today vs yesterday',
      'stats.periodWeek': 'Change this week vs last week',
      'stats.periodWeekTotal': 'This week · {total} active days in total',
      'stats.trends': 'Trends',
      'stats.streak': 'Current streak',
      'stats.bestStreak': 'Best streak',
      'stats.activeDay': 'Active day',
      'stats.inactiveDay': 'No activity',
      'stats.new': 'NEW',
      'quests.title': 'Daily quests',
      'quest.immersion': 'Immersion',
      'quest.collector': 'Collector',
      'quest.nightMarathon': 'Night marathon',
      'quest.desc.immersion': 'Listen to music for 30 minutes in total today. Time counts only while a track is actually playing.',
      'quest.desc.collector': 'Add 3 tracks to your favorites today.',
      'quest.desc.nightMarathon': 'Finish 10 tracks today. Skipping a track does not count — the track must reach the end.',
      'quest.more': 'Details',
      'quest.availableIn': 'Available in:',
      'quest.ready': 'Quest complete — claim your reward!',
      'quest.readyClaim': 'Completed! Claim',
      'quest.inProgress': 'In progress',
      'quest.claimed': 'Reward claimed!',
      'quest.progressMinutes': '{current} / {target} min',
      'quest.progressFavorites': '{current} / {target} tracks',
      'quest.progressTracks': '{current} / {target} tracks',
      'achievements.title': 'Achievements',
      'achievements.hidden': '???',
      'achievements.hint': 'Not unlocked yet. Figure out how to get it.',
      'achievements.unlockedTitle': 'You unlocked a new achievement',
      'achievements.showAll': 'Show all (+{count})',
      'achievements.showLess': 'Collapse',
      'achievements.rarity.common': 'Common',
      'achievements.rarity.rare': 'Rare',
      'achievements.rarity.epic': 'Epic',
      'achievements.rarity.legendary': 'Legendary',
      'listening.title': 'Listening statistics',
      'listening.avg': 'Avg per day',
      'listening.range7': '7 days',
      'listening.range30': '30 days',
      'listening.rangeYear': 'Year',
      'listening.rangeAll': 'All time',
      'listening.less': 'Less',
      'listening.more': 'More',
      'time.minutes': '{count} min',
      'time.hoursDecimal': '{value}h',
      'time.hours': '{count}h',
      'rank.base': 'Base user',
      'rank.medium': 'Intermediate',
      'rank.advanced': 'Advanced',
      'rank.high': 'Supreme',
      'rank.saint': 'Saint',
      'rank.king': 'King',
      'rank.emperor': 'Emperor',
      'rank.god': 'God',
      'achievement.first_echo': 'The First Echo',
      'achievement.initiated_darkness': 'Initiated into Darkness',
      'achievement.ether_keeper': 'Guardian of the Ether',
      'achievement.abyss_architect': 'Architect of the Abyss',
      'achievement.resonance_lord': 'Master of Resonance',
      'achievement.midnight_pilgrim': 'Midnight Pilgrim',
      'achievement.deep_dive': 'Deep Dive',
      'achievement.void_whisper': 'Whisper of the Void',
      'achievement.obsession': 'Obsession',
      'achievement.blind_fate': 'Blind Fate',
      'achievement.black_pearl': 'Black Pearl',
      'achievement.secret_archive': 'Secret Archive',
      'achievement.shadow_curator': 'Curator of Shadows',
      'achievement.grand_grimoire': 'The Grand Grimoire',
      'achievement.double_resonance': 'Double Resonance',
      'achievement.continuous_trance': 'Continuous Trance',
      'achievement.eternal_wanderer': 'Eternal Wanderer',
      'achievement.self_awareness': 'Self-awareness',
      'achievement.sound_alchemist': 'Alchemist of Sound',
      'achievement.ruler_of_noctra': 'Ruler of Noctra',
    },
    ru: {
      'nav.profile': 'Профиль',
      'top.back': 'Назад',
      'hero.edit': 'Редактировать профиль',
      'edit.title': 'Редактирование профиля',
      'edit.nick': 'Никнейм',
      'edit.handle': 'Хендл (@)',
      'edit.status': 'Статус',
      'edit.bio': 'О себе',
      'edit.cover': 'Сменить баннер',
      'edit.avatar': 'Сменить аватар',
      'edit.save': 'Сохранить',
      'edit.cancel': 'Отмена',
      'edit.remove': 'Удалить',
      'edit.nickRequired': 'Никнейм не может быть пустым.',
      'edit.pickUnavailable': 'Выбор изображения недоступен.',
      'now.title': 'Сейчас играет',
      'now.empty': 'Ничего не играет',
      'now.pick': 'Включи трек, чтобы увидеть его здесь',
      'now.queue': 'Далее в очереди',
      'now.emptyQueue': 'Очередь пуста',
      'now.shuffle': 'Перемешать',
      'now.previous': 'Предыдущий',
      'now.next': 'Следующий',
      'now.repeat': 'Повтор',
      'now.play': 'Воспроизвести',
      'modal.close': 'Закрыть',
      'level.label': 'Уровень',
      'level.next': 'До следующего ранга',
      'level.max': 'Максимальный ранг',
      'level.remaining': '+{xp} XP',
      'level.range': '{current} / {total} XP',
      'stats.title': 'Общая статистика',
      'stats.listening': 'Время прослушивания',
      'stats.tracks': 'Треков прослушано',
      'stats.likes': 'Любимых треков',
      'stats.activeDays': 'Дней активности',
      'stats.periodToday': 'Изменение за сегодня к вчерашнему дню',
      'stats.periodWeek': 'Изменение за эту неделю к прошлой',
      'stats.periodWeekTotal': 'Текущая неделя · всего активных дней: {total}',
      'stats.trends': 'Тренды',
      'stats.streak': 'Текущая серия',
      'stats.bestStreak': 'Лучшая серия',
      'stats.activeDay': 'Активный день',
      'stats.inactiveDay': 'Без активности',
      'stats.new': 'NEW',
      'quests.title': 'Ежедневные задания',
      'quest.immersion': 'Погружение',
      'quest.collector': 'Коллекционер',
      'quest.nightMarathon': 'Ночной марафон',
      'quest.desc.immersion': 'Слушай музыку суммарно 30 минут за день. Время считается, пока трек реально играет.',
      'quest.desc.collector': 'Добавь 3 трека в избранное за день.',
      'quest.desc.nightMarathon': 'Дослушай 10 треков до конца за день. Переключение трека вручную не засчитывается — нужен полный трек.',
      'quest.more': 'Подробнее',
      'quest.availableIn': 'Доступно через:',
      'quest.ready': 'Задание выполнено — забери награду!',
      'quest.readyClaim': 'Выполнено! Забрать',
      'quest.inProgress': 'В процессе выполнения',
      'quest.claimed': 'Награда получена!',
      'quest.progressMinutes': '{current} / {target} мин',
      'quest.progressFavorites': '{current} / {target} трека',
      'quest.progressTracks': '{current} / {target} треков',
      'achievements.title': 'Достижения',
      'achievements.hidden': '???',
      'achievements.hint': 'Ещё не открыто. Догадайся, как получить.',
      'achievements.unlockedTitle': 'Вы открыли новое достижение',
      'achievements.showAll': 'Показать все (+{count})',
      'achievements.showLess': 'Свернуть',
      'achievements.rarity.common': 'Обычное',
      'achievements.rarity.rare': 'Редкое',
      'achievements.rarity.epic': 'Эпическое',
      'achievements.rarity.legendary': 'Легендарное',
      'listening.title': 'Статистика прослушивания',
      'listening.avg': 'В среднем в день',
      'listening.range7': '7 дней',
      'listening.range30': '30 дней',
      'listening.rangeYear': 'Год',
      'listening.rangeAll': 'Всё время',
      'listening.less': 'Меньше',
      'listening.more': 'Больше',
      'time.minutes': '{count} мин',
      'time.hoursDecimal': '{value} ч',
      'time.hours': '{count} ч',
      'rank.base': 'Базовый пользователь',
      'rank.medium': 'Средний уровень',
      'rank.advanced': 'Продвинутый',
      'rank.high': 'Высший',
      'rank.saint': 'Святой',
      'rank.king': 'Король',
      'rank.emperor': 'Император',
      'rank.god': 'Бог',
      'achievement.first_echo': 'Первый отзвук',
      'achievement.initiated_darkness': 'Посвящённый во тьму',
      'achievement.ether_keeper': 'Хранитель эфира',
      'achievement.abyss_architect': 'Архитектор бездны',
      'achievement.resonance_lord': 'Владыка резонанса',
      'achievement.midnight_pilgrim': 'Полуночный пилигрим',
      'achievement.deep_dive': 'Глубокое погружение',
      'achievement.void_whisper': 'Шёпот пустоты',
      'achievement.obsession': 'Одержимость',
      'achievement.blind_fate': 'Слепая судьба',
      'achievement.black_pearl': 'Чёрная жемчужина',
      'achievement.secret_archive': 'Тайный архив',
      'achievement.shadow_curator': 'Куратор теней',
      'achievement.grand_grimoire': 'Великий гримуар',
      'achievement.double_resonance': 'Двойной резонанс',
      'achievement.continuous_trance': 'Непрерывный транс',
      'achievement.eternal_wanderer': 'Вечный скиталец',
      'achievement.self_awareness': 'Осознание личности',
      'achievement.sound_alchemist': 'Алхимик звука',
      'achievement.ruler_of_noctra': 'Повелитель Ноктры',
    },
  };

  function languageCode() {
    const keys = ['riff_ui_lang', 'riff_lang', 'riff_language', 'riff_locale', 'ui_lang'];
    for (const key of keys) {
      const value = String(localStorage.getItem(key) || '').trim().toLowerCase();
      if (value && value !== 'auto' && value !== 'system') return value;
    }
    return String(navigator.language || 'en').toLowerCase();
  }

  function currentLanguage() {
    const lang = languageCode();
    return lang.startsWith('ru') || lang.startsWith('uk') || lang.startsWith('be') ? 'ru' : 'en';
  }

  function t(key, vars) {
    const dict = STRINGS[currentLanguage()] || STRINGS.en;
    let value = dict[key] || STRINGS.en[key] || key;
    if (vars) {
      value = value.replace(/\{(\w+)\}/g, (match, name) => (
        vars[name] === undefined || vars[name] === null ? match : String(vars[name])
      ));
    }
    return value;
  }

  /* ── catalogs ───────────────────────────────────────────────────────── */

  const RANKS = [
    { tier: 1, minXp: 0, labelKey: 'rank.base' },
    { tier: 2, minXp: 500, labelKey: 'rank.medium' },
    { tier: 3, minXp: 1200, labelKey: 'rank.advanced' },
    { tier: 4, minXp: 2000, labelKey: 'rank.high' },
    { tier: 5, minXp: 2850, labelKey: 'rank.saint' },
    { tier: 6, minXp: 3900, labelKey: 'rank.king' },
    { tier: 7, minXp: 5000, labelKey: 'rank.emperor' },
    { tier: 8, minXp: 7000, labelKey: 'rank.god' },
  ];

  const RARITY_GLOW = {
    common: 0.25,
    rare: 0.45,
    epic: 0.7,
    legendary: 1,
  };

  const ACHIEVEMENT_XP = {
    common: 50,
    rare: 75,
    epic: 100,
    legendary: 150,
  };

  function achievementXp(achievement) {
    return ACHIEVEMENT_XP[achievement.rarity] || ACHIEVEMENT_XP.common;
  }

  const ACHIEVEMENTS = [
    { id: 'first_echo', icon: 'The First Echo.png', rarity: 'common', metric: 'tracks_total', target: 1 },
    { id: 'initiated_darkness', icon: 'Initiated into Darkness.png', rarity: 'common', metric: 'tracks_total', target: 100 },
    { id: 'ether_keeper', icon: 'Guardian of the Ether.png', rarity: 'rare', metric: 'tracks_total', target: 500 },
    { id: 'abyss_architect', icon: 'Architect of the Abyss.png', rarity: 'epic', metric: 'tracks_total', target: 1000 },
    { id: 'resonance_lord', icon: 'Master of Resonance.png', rarity: 'legendary', metric: 'tracks_total', target: 5000 },
    { id: 'midnight_pilgrim', icon: 'Midnight Pilgrim.png', rarity: 'rare', metric: 'night_plays', target: null },
    { id: 'deep_dive', icon: 'Deep Dive.png', rarity: 'rare', metric: 'session_seconds', target: 10800 },
    { id: 'void_whisper', icon: 'Whisper of the Void.png', rarity: 'epic', metric: 'album_complete', target: null },
    { id: 'obsession', icon: 'Obsession.png', rarity: 'rare', metric: 'repeat_loops', target: 10 },
    { id: 'blind_fate', icon: 'Blind Fate.png', rarity: 'epic', metric: 'shuffle_streak', target: 50 },
    { id: 'black_pearl', icon: 'Black Pearl.png', rarity: 'common', metric: 'favorites_total', target: 1 },
    { id: 'secret_archive', icon: 'Secret Archive.png', rarity: 'rare', metric: 'favorites_total', target: 100 },
    { id: 'shadow_curator', icon: 'Curator of Shadows.png', rarity: 'common', metric: 'playlists_total', target: 1 },
    { id: 'grand_grimoire', icon: 'The Grand Grimoire.png', rarity: 'epic', metric: 'playlist_tracks', target: 50 },
    { id: 'double_resonance', icon: 'Double resonance.png', rarity: 'rare', metric: 'dual_source', target: null },
    { id: 'continuous_trance', icon: 'Continuous trance.png', rarity: 'rare', metric: 'streak_days', target: 7 },
    { id: 'eternal_wanderer', icon: 'Eternal Wanderer.png', rarity: 'legendary', metric: 'streak_days', target: 30 },
    { id: 'self_awareness', icon: 'Self-awareness.png', rarity: 'epic', metric: 'profile_complete', target: null },
    { id: 'sound_alchemist', icon: 'Alchemist of Sound.png', rarity: 'epic', metric: 'quests_claimed', target: 10 },
    { id: 'ruler_of_noctra', icon: 'Ruler of Noctra.png', rarity: 'legendary', metric: 'max_rank', target: 8 },
  ];

  const QUESTS = [
    { id: 'immersion', titleKey: 'quest.immersion', target: 30, rewardXP: 10 },
    { id: 'collector', titleKey: 'quest.collector', target: 3, rewardXP: 5 },
    { id: 'nightMarathon', titleKey: 'quest.nightMarathon', target: 10, rewardXP: 8 },
  ];

  const RANGE_DAYS = { '7d': 7, '30d': 30, year: 365, all: 365 };

  /* ── state ──────────────────────────────────────────────────────────── */

  let bridge = null;
  let store = null;
  let freshInstall = false;
  let profile = {};
  let library = { favoriteIds: [], playlists: [], counts: { favorites: 0, playlists: 0 } };
  let initialized = false;
  let pendingShow = false;
  let isVisible = false;
  let editing = false;
  let editDraft = null;
  let editError = '';
  let achievementsExpanded = false;
  let listeningRange = '30d';
  let activeModal = null;
  let activeQuestId = null;
  let claimFx = null;
  let toastQueue = [];
  let toastShowing = false;
  let saveTimer = null;
  let waveformRaf = 0;
  let waveformPhase = 0;
  let lastSnapshot = null;
  let lastTickWall = 0;
  let lastQuestState = '';
  let lastProfileSignature = '';
  let lastAchievementCheck = 0;
  let checkingAchievements = false;
  let libraryPollBusy = false;
  let lastLanguage = null;
  let lastBgEnabled = null;
  let isSeekingTrack = false;
  let currentPlay = null;
  let globalFx = null;
  let globalParallaxFrame = 0;
  let globalParallaxPoint = null;

  function defaultDaily(date) {
    return {
      date: date || todayKey(),
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

  function defaultProgression() {
    return {
      totalXP: 0,
      totalSecondsListened: 0,
      totalTracksPlayed: 0,
      historyMap: {},
      tracksByDay: {},
      favoritesByDay: {},
      counters: {
        nightPlays: 0,
        maxSessionSeconds: 0,
        repeatLoops: 0,
        shuffleStreak: 0,
        sources: [],
      },
      currentSessionSeconds: 0,
      lastTickAt: 0,
      repeatRun: 0,
      shuffleRun: 0,
      lastTrackId: null,
      favoriteXpTrackIds: {},
      lastFavoriteIds: null,
      lastMaxPlaylistTracks: null,
      questsClaimedTotal: 0,
      daily: defaultDaily(),
      unlocked: {},
      seen: [],
      achievementXpGranted: [],
    };
  }

  function mergeProgression(raw) {
    const base = defaultProgression();
    if (!raw || typeof raw !== 'object') return base;

    const merged = Object.assign(base, raw);
    merged.counters = Object.assign(defaultProgression().counters, raw.counters || {});
    const seenSources = new Set();
    merged.counters.sources = (Array.isArray(merged.counters.sources) ? merged.counters.sources : []).filter((source) => {
      const key = String(source || '').trim().toLowerCase();
      if (!key || seenSources.has(key)) return false;
      seenSources.add(key);
      return true;
    });
    merged.historyMap = raw.historyMap && typeof raw.historyMap === 'object' ? raw.historyMap : {};
    merged.tracksByDay = raw.tracksByDay && typeof raw.tracksByDay === 'object' ? raw.tracksByDay : {};
    merged.favoritesByDay = raw.favoritesByDay && typeof raw.favoritesByDay === 'object' ? raw.favoritesByDay : {};
    merged.favoriteXpTrackIds = raw.favoriteXpTrackIds && typeof raw.favoriteXpTrackIds === 'object' ? raw.favoriteXpTrackIds : {};
    merged.unlocked = raw.unlocked && typeof raw.unlocked === 'object' ? raw.unlocked : {};
    merged.seen = Array.isArray(raw.seen) ? raw.seen : [];
    merged.achievementXpGranted = Array.isArray(raw.achievementXpGranted) ? raw.achievementXpGranted : [];
    merged.lastFavoriteIds = Array.isArray(raw.lastFavoriteIds) ? raw.lastFavoriteIds : null;
    merged.lastMaxPlaylistTracks = Number.isFinite(Number(raw.lastMaxPlaylistTracks))
      ? Number(raw.lastMaxPlaylistTracks)
      : null;

    const daily = raw.daily && typeof raw.daily === 'object' ? raw.daily : {};
    const baseDaily = defaultDaily(daily.date || todayKey());
    merged.daily = Object.assign(baseDaily, daily);
    merged.daily.quests = Object.assign(defaultDaily().quests, daily.quests || {});
    QUESTS.forEach((quest) => {
      if (!merged.daily.quests[quest.id] || typeof merged.daily.quests[quest.id] !== 'object') {
        merged.daily.quests[quest.id] = { claimed: false };
      }
    });

    return merged;
  }

  function loadStore() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (_) {}

    if (!raw) {
      freshInstall = true;
      return { version: PROFILE_VERSION, progression: defaultProgression() };
    }

    try {
      const parsed = JSON.parse(raw);
      return {
        version: PROFILE_VERSION,
        progression: mergeProgression(parsed && parsed.progression),
      };
    } catch (_) {
      freshInstall = true;
      return { version: PROFILE_VERSION, progression: defaultProgression() };
    }
  }

  function saveNow() {
    if (!store) return;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: PROFILE_VERSION, progression: store.progression }));
    } catch (error) {
      console.warn('[profile] save failed', error);
    }
  }

  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveNow();
    }, 1500);
  }

  /* ── domain helpers ─────────────────────────────────────────────────── */

  function progression() {
    return store.progression;
  }

  function today(now) {
    return todayKey(now || new Date());
  }

  function rolloverIfNeeded() {
    const p = progression();
    const key = today();
    if (p.daily.date === key) return false;
    p.daily = defaultDaily(key);
    scheduleSave();
    if (initialized && isProfileActive()) {
      renderLevel();
      renderStats();
    }
    return true;
  }

  function registerSource(source) {
    const value = String(source || '').trim();
    if (!value) return;

    const p = progression();
    const key = value.toLowerCase();
    const exists = (p.counters.sources || []).some((item) => String(item || '').trim().toLowerCase() === key);
    if (!exists) {
      p.counters.sources.push(value);
      scheduleSave();
    }
  }

  function getRankByXp(xp) {
    let current = RANKS[0];
    for (const rank of RANKS) {
      if (xp >= rank.minXp) current = rank;
      else break;
    }
    return current;
  }

  function getNextRank(xp) {
    return RANKS.find((rank) => rank.minXp > xp) || null;
  }

  function getRankProgress(xp) {
    const rank = getRankByXp(xp);
    const next = getNextRank(xp);

    if (!next) {
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

    const range = next.minXp - rank.minXp;
    const into = xp - rank.minXp;
    return {
      xp,
      rank,
      nextRank: next,
      xpIntoRank: into,
      xpForRank: range,
      percent: range > 0 ? clamp(Math.round((into / range) * 100), 0, 100) : 0,
      xpToNext: Math.max(0, next.minXp - xp),
    };
  }

  function rankIcon(rank) {
    return `${RANK_PATH}${rank.tier}.png`;
  }

  function achievementIcon(achievement) {
    return `${ACHIEVEMENT_PATH}${encodeURIComponent(achievement.icon)}`;
  }

  function addXp(amount) {
    const value = Math.floor(Number(amount) || 0);
    if (value <= 0) return;
    progression().totalXP += value;
    scheduleSave();
    updateXpUi();
  }

  function collectActiveDays(histories) {
    const days = new Set();
    (histories || []).forEach((history) => {
      Object.entries(history || {}).forEach(([date, value]) => {
        if (Number(value) > 0) days.add(date);
      });
    });
    return Array.from(days).sort();
  }

  function activeDates() {
    const p = progression();
    return collectActiveDays([p.historyMap, p.tracksByDay, p.favoritesByDay]);
  }

  function countActiveDaysThisWeek(dates, now) {
    const current = now || new Date();
    const weekStart = startOfWeek(current);
    const keys = new Set();
    for (let i = 0; i < 7; i++) keys.add(localDateKey(shiftDays(weekStart, i)));
    return new Set((dates || []).filter((date) => keys.has(date))).size;
  }

  function valueAt(history, date) {
    return Number((history || {})[localDateKey(date)] || 0);
  }

  function toDelta(current, previous) {
    if (!(previous > 0)) {
      if (!(current > 0)) return { percent: 0, direction: 'flat' };
      return { percent: 100, direction: 'up' };
    }
    const percent = Math.round(((current - previous) / previous) * 100);
    return { percent, direction: percent >= 0 ? 'up' : 'down' };
  }

  function computeDailyDelta(history) {
    const now = new Date();
    return toDelta(valueAt(history, now), valueAt(history, shiftDays(now, -1)));
  }

  function computeActiveDaysDelta(dates, now) {
    const unique = new Set(dates || []);
    const current = countActiveDaysThisWeek(dates, now);
    const weekStart = startOfWeek(now || new Date());
    const previousStart = shiftDays(weekStart, -7);

    let previous = 0;
    for (let i = 0; i < 7; i++) {
      if (unique.has(localDateKey(shiftDays(previousStart, i)))) previous += 1;
    }

    return toDelta(current, previous);
  }

  function recentDayKeys(count) {
    const result = [];
    const now = new Date();
    for (let i = count - 1; i >= 0; i -= 1) {
      const date = shiftDays(now, -i);
      result.push({ date, key: localDateKey(date) });
    }
    return result;
  }

  function historyDaySeries(history, count = 7) {
    return recentDayKeys(count).map(({ date, key }) => ({
      date: key,
      value: Number((history || {})[key] || 0),
    }));
  }

  function formatWeekRange(start, end) {
    const fmt = (date) => `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`;
    return `${fmt(start)}–${fmt(end)}`;
  }

  function weeklyActiveDaySeries(count = 8) {
    const active = new Set(activeDates());
    const currentWeekStart = startOfWeek(new Date());
    const result = [];
    for (let i = count - 1; i >= 0; i -= 1) {
      const start = shiftDays(currentWeekStart, -7 * i);
      let value = 0;
      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        if (active.has(localDateKey(shiftDays(start, dayIndex)))) value += 1;
      }
      result.push({ date: formatWeekRange(start, shiftDays(start, 6)), value });
    }
    return result;
  }

  function currentStreakDays(dates) {
    const active = new Set(dates || []);
    const cursor = new Date();
    if (!active.has(todayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (active.has(todayKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function longestStreakDays(dates) {
    const unique = Array.from(new Set(dates || [])).sort();
    let best = 0;
    let run = 0;
    let previous = null;
    unique.forEach((key) => {
      const date = new Date(`${key}T00:00:00`);
      if (previous && Math.round((date - previous) / 86400000) === 1) run += 1;
      else run = 1;
      if (run > best) best = run;
      previous = date;
    });
    return best;
  }

  function statDayTitle(key, day) {
    if (key === 'listening') return `${day.date} · ${formatListeningTime(day.value * 60)}`;
    if (key === 'activeDays') return `${day.date} · ${formatNumber(day.value)} / 7`;
    return `${day.date} · ${formatNumber(day.value)}`;
  }

  function statSeries(key) {
    const p = progression();
    if (key === 'listening') return historyDaySeries(p.historyMap);
    if (key === 'tracks') return historyDaySeries(p.tracksByDay);
    if (key === 'likes') return historyDaySeries(p.favoritesByDay);
    return weeklyActiveDaySeries(8);
  }

  function sparklineGeometry(series, key) {
    const total = series.length || 1;
    const max = key === 'activeDays' ? 7 : Math.max(1, ...series.map((day) => day.value));
    const points = series.map((day, index) => {
      const x = total > 1 ? 3 + (index / (total - 1)) * 94 : 50;
      const normalized = Math.max(0, Math.min(1, day.value / max));
      const y = 38 - normalized * 32;
      return {
        x,
        y,
        xPercent: x,
        yPercent: (y / 42) * 100,
        title: statDayTitle(key, day),
      };
    });

    let line = '';
    if (points.length) {
      line = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
      for (let i = 1; i < points.length; i += 1) {
        const previous = points[i - 1];
        const current = points[i];
        const mid = ((previous.x + current.x) / 2).toFixed(2);
        line += ` C ${mid} ${previous.y.toFixed(2)}, ${mid} ${current.y.toFixed(2)}, ${current.x.toFixed(2)} ${current.y.toFixed(2)}`;
      }
    }
    const area = points.length
      ? `${line} L ${points[points.length - 1].x.toFixed(2)} 42 L ${points[0].x.toFixed(2)} 42 Z`
      : '';

    return { points, line, area };
  }

  function statChartMarkup(key) {
    const series = statSeries(key);
    const geometry = sparklineGeometry(series, key);
    const gradientId = `rp-spark-grad-${key}`;
    const points = geometry.points.map((point, index) => `
      <span class="rp-spark-point${index === geometry.points.length - 1 ? ' is-last' : ''}"
        style="left:${point.xPercent.toFixed(2)}%;top:${point.yPercent.toFixed(2)}%"
        title="${escapeHtml(point.title)}" aria-label="${escapeHtml(point.title)}"></span>
    `).join('');

    return `<span class="rp-stat-chart">
      <span class="rp-stat-sparkline" data-rp-spark="${key}">
        <svg class="rp-sparkline" viewBox="0 0 100 42" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
              <stop class="rp-spark-grad-start" offset="0%"></stop>
              <stop class="rp-spark-grad-end" offset="100%"></stop>
            </linearGradient>
          </defs>
          <path class="rp-sparkline-area" style="fill:url(#${gradientId})" d="${geometry.area}"></path>
          <path class="rp-sparkline-line" vector-effect="non-scaling-stroke" d="${geometry.line}"></path>
        </svg>
        ${points}
      </span>
    </span>`;
  }

  function updateStatChart(key) {
    const wrap = document.querySelector(`[data-rp-spark="${key}"]`);
    if (!wrap) return;
    const geometry = sparklineGeometry(statSeries(key), key);
    const line = wrap.querySelector('.rp-sparkline-line');
    const area = wrap.querySelector('.rp-sparkline-area');
    if (line) line.setAttribute('d', geometry.line);
    if (area) area.setAttribute('d', geometry.area);

    const points = wrap.querySelectorAll('.rp-spark-point');
    geometry.points.forEach((point, index) => {
      const node = points[index];
      if (!node) return;
      node.style.left = `${point.xPercent.toFixed(2)}%`;
      node.style.top = `${point.yPercent.toFixed(2)}%`;
      node.title = point.title;
      node.setAttribute('aria-label', point.title);
      node.classList.toggle('is-last', index === geometry.points.length - 1);
    });
  }

  function renderStreakBadges() {
    const dates = activeDates();
    const current = currentStreakDays(dates);
    const best = longestStreakDays(dates);
    const bestMarkup = best > current
      ? `<span class="rp-streak-best" title="${escapeHtml(t('stats.bestStreak'))}">🏆 ${formatNumber(best)}</span>`
      : '';
    return `<span class="rp-streak-badges" data-rp-streak-badges>${bestMarkup}<span class="rp-streak-current" title="${escapeHtml(t('stats.streak'))}">🔥 ${formatNumber(current)}</span></span>`;
  }

  function updateStreakBadges() {
    const node = document.querySelector('[data-rp-streak-badges]');
    if (node) node.outerHTML = renderStreakBadges();
  }

  function formatListeningTime(seconds) {
    const safe = Math.max(0, Number(seconds) || 0);
    const hours = safe / 3600;
    if (hours < 1) return t('time.minutes', { count: Math.round(safe / 60) });
    if (hours < 100) return t('time.hoursDecimal', { value: (Math.round(hours * 10) / 10).toFixed(1) });
    return t('time.hours', { count: Math.round(hours) });
  }

  function getQuestProgress(id) {
    const daily = progression().daily;
    if (id === 'immersion') return Math.floor(daily.listenedSeconds / 60);
    if (id === 'collector') return daily.favoritesAdded;
    return daily.completedTracks;
  }

  function questProgressText(id, progress, target) {
    if (id === 'immersion') return t('quest.progressMinutes', { current: progress, target });
    if (id === 'collector') return t('quest.progressFavorites', { current: progress, target });
    return t('quest.progressTracks', { current: progress, target });
  }

  function maxPlaylistTracks() {
    return (library.playlists || []).reduce((max, playlist) => Math.max(max, Number(playlist.trackCount) || 0), 0);
  }

  function profileComplete() {
    return Boolean(
      String(profile.nick || '').trim() &&
      String(profile.bio || '').trim() &&
      String(profile.avatar || '').trim() &&
      String(profile.banner || '').trim()
    );
  }

  function getMetrics() {
    const p = progression();
    const dates = activeDates();
    const rank = getRankByXp(p.totalXP);
    return {
      tracksTotal: p.totalTracksPlayed,
      favoritesTotal: Number(library.counts.favorites) || 0,
      playlistsTotal: Number(library.counts.playlists) || 0,
      playlistTracks: maxPlaylistTracks(),
      streakDays: dates.length,
      questsClaimed: p.questsClaimedTotal,
      rankTier: rank.tier,
      nightPlays: p.counters.nightPlays,
      sessionSeconds: p.counters.maxSessionSeconds,
      repeatLoops: p.counters.repeatLoops,
      shuffleStreak: p.counters.shuffleStreak,
      sourceKinds: new Set(
        (p.counters.sources || [])
          .map((source) => String(source || '').trim().toLowerCase())
          .filter(Boolean)
      ).size,
      profileComplete: profileComplete(),
      albumComplete: p.counters.maxSessionSeconds >= 600,
    };
  }

  function metricValue(achievement, metrics) {
    switch (achievement.metric) {
      case 'tracks_total': return metrics.tracksTotal;
      case 'favorites_total': return metrics.favoritesTotal;
      case 'playlists_total': return metrics.playlistsTotal;
      case 'playlist_tracks': return metrics.playlistTracks;
      case 'streak_days': return metrics.streakDays;
      case 'quests_claimed': return metrics.questsClaimed;
      case 'max_rank': return metrics.rankTier;
      case 'night_plays': return metrics.nightPlays;
      case 'session_seconds': return metrics.sessionSeconds;
      case 'repeat_loops': return metrics.repeatLoops;
      case 'shuffle_streak': return metrics.shuffleStreak;
      case 'dual_source': return metrics.sourceKinds;
      default: return achievement.target === null ? 1 : 0;
    }
  }

  function achievementProgress(achievement, metrics, unlocked) {
    if (unlocked) return 100;
    if (achievement.target === null || achievement.target <= 0) return null;
    return clamp(Math.round((metricValue(achievement, metrics) / achievement.target) * 100), 0, 100);
  }

  function conditionMet(achievement, metrics) {
    switch (achievement.metric) {
      case 'album_complete': return metrics.albumComplete;
      case 'profile_complete': return metrics.profileComplete;
      case 'dual_source': return metrics.sourceKinds >= 2;
      case 'night_plays': return metrics.nightPlays >= 1;
      default: return achievement.target !== null && metricValue(achievement, metrics) >= achievement.target;
    }
  }

  function unlockedCount() {
    return Object.keys(progression().unlocked || {}).length;
  }

  /* ── profile fields ─────────────────────────────────────────────────── */

  function readProfile() {
    if (bridge) profile = bridge.getUserProfile();
    if (!profile || !profile.nick) {
      profile = {
        nick: 'User',
        avatar: '',
        handle: '',
        status: '',
        bio: '',
        banner: '',
        bannerFx: '',
      };
    }
    profile.handle = profile.handle || normalizeHandle(profile.nick);
    return profile;
  }

  function profileSignature() {
    return [profile.nick, profile.avatar, profile.handle, profile.status, profile.bio, profile.banner, profile.bannerFx].join('\u0000');
  }

  /* ── shell and rendering ────────────────────────────────────────────── */

  function profileBackgroundEnabled() {
    return localStorage.getItem('riff_profile_bg_effects') !== '0';
  }

  function globalBackdropMarkup() {
    return `
      <div id="riff-global-bg" aria-hidden="true">
        <div class="riff-global-aurora"></div>
        <span class="riff-global-beam b1"></span>
        <span class="riff-global-beam b2"></span>
        <span class="riff-global-orb o1"></span>
        <span class="riff-global-orb o2"></span>
        <span class="riff-global-orb o3"></span>
        <span class="riff-global-orb o4"></span>
        <span class="riff-global-orb o5"></span>
        <span class="riff-global-orb o6"></span>
        <span class="riff-global-glow"></span>
        <canvas class="riff-global-particles" id="riff-global-canvas"></canvas>
        <span class="riff-global-noise"></span>
      </div>
    `;
  }

  function readGlobalToneColors() {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;pointer-events:none;';
    document.body.appendChild(probe);
    const resolve = (expression, fallback) => {
      probe.style.color = expression;
      const value = getComputedStyle(probe).color;
      return value && value !== 'rgba(0, 0, 0, 0)' ? value : fallback;
    };
    const primary = resolve('var(--md-sys-color-primary, #ef8f8f)', 'rgb(239, 143, 143)');
    const secondary = resolve('var(--md-sys-color-secondary, var(--md-sys-color-primary, #ef8f8f))', primary);
    const tertiary = resolve('var(--md-sys-color-tertiary, var(--md-sys-color-primary, #ef8f8f))', primary);
    probe.remove();
    return [primary, secondary, tertiary, 'rgb(255, 255, 255)'];
  }

  function createGlobalParticleSprite(color, bokeh) {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return canvas;
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    if (bokeh) {
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
      gradient.addColorStop(0.52, 'rgba(255, 255, 255, 0.2)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    } else {
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
      gradient.addColorStop(0.12, 'rgba(255, 255, 255, 0.82)');
      gradient.addColorStop(0.38, 'rgba(255, 255, 255, 0.24)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    }
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    context.globalCompositeOperation = 'source-in';
    context.fillStyle = color;
    context.fillRect(0, 0, size, size);
    return canvas;
  }

  function drawGlobalParticles() {
    const fx = globalFx;
    if (!fx) return;
    const { ctx, width, height } = fx;
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    const time = fx.time;
    for (const particle of fx.particles) {
      const drift = Math.sin(time * particle.swaySpeed + particle.phase) * particle.sway;
      const wobble = Math.cos(time * particle.twinkleSpeed + particle.phase) * particle.wobble;
      const x = particle.x + drift + fx.parallaxX * particle.depth;
      const y = particle.y + wobble + fx.parallaxY * particle.depth;
      const flicker = 0.72 + 0.28 * Math.sin(time * particle.twinkleSpeed + particle.phase);
      const size = particle.size * (particle.bokeh ? 1 : 0.92 + 0.12 * Math.sin(time * particle.swaySpeed + particle.phase));
      ctx.globalAlpha = clamp(particle.alpha * flicker, 0, 1);
      ctx.drawImage(particle.bokeh ? fx.bokehSprites[particle.tone] : fx.emberSprites[particle.tone], x - size / 2, y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function stepGlobalParticles(delta) {
    const fx = globalFx;
    if (!fx) return;
    for (const particle of fx.particles) {
      particle.y -= particle.rise * delta;
      if (particle.y < -particle.size * 2) {
        particle.y = fx.height + particle.size * 2;
        particle.x = Math.random() * fx.width;
      }
    }
  }

  function updateGlobalAmbient(fx, time) {
    if (!fx) return;
    if (fx.aurora) {
      fx.aurora.style.transform = `translate3d(${(Math.sin(time * 0.05) * 2).toFixed(2)}%, ${(Math.cos(time * 0.04) * 1.5).toFixed(2)}%, 0)`;
    }
    fx.beams.forEach((beam, index) => {
      const wave = Math.sin(time * 0.08 + index * 2.2);
      beam.style.transform = `translate3d(${(wave * 12).toFixed(2)}%, 0, 0)`;
      beam.style.opacity = (0.22 + wave * 0.06).toFixed(3);
    });
    fx.orbs.forEach((orb) => {
      // Orbs stay static: their continuous translate/scale read as a moving
      // object through the translucent sidebar. Pointer parallax is CSS-only.
      if (orb.style.transform) orb.style.transform = '';
    });
    if (fx.glow) {
      const wave = Math.sin(time * 0.06);
      fx.glow.style.transform = '';
      fx.glow.style.opacity = (0.55 + wave * 0.12).toFixed(3);
    }
  }

  function stopGlobalFx() {
    const fx = globalFx;
    if (!fx) return;
    if (fx.raf) cancelAnimationFrame(fx.raf);
    if (fx.resizeRaf) cancelAnimationFrame(fx.resizeRaf);
    if (fx.themeTimer) clearTimeout(fx.themeTimer);
    if (fx.themeObserver) fx.themeObserver.disconnect();
    window.removeEventListener('resize', fx.onResize);
    document.removeEventListener('visibilitychange', fx.onVisibility);
    window.removeEventListener('blur', fx.onPause);
    window.removeEventListener('focus', fx.onResume);
    document.body.classList.remove('riff-global-bg-lite');
    globalFx = null;
  }

  function initGlobalFx() {
    stopGlobalFx();
    const layer = document.getElementById('riff-global-bg');
    const canvas = document.getElementById('riff-global-canvas');
    if (!layer || !canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reduced = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const lowPower = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
    const colors = readGlobalToneColors();
    document.body.classList.toggle('riff-global-bg-lite', lowPower);
    const fx = {
      canvas,
      ctx,
      reduced,
      lowPower,
      width: Math.max(1, layer.clientWidth || window.innerWidth),
      height: Math.max(1, layer.clientHeight || window.innerHeight),
      scale: 1,
      time: 0,
      last: 0,
      raf: 0,
      resizeRaf: 0,
      paused: true,
      lastAmbient: 0,
      ambientInterval: lowPower ? 250 : 150,
      frameInterval: 1000 / (lowPower ? 24 : 30),
      colorSignature: colors.join('|'),
      themeTimer: 0,
      themeObserver: null,
      parallaxX: 0,
      parallaxY: 0,
      aurora: layer.querySelector('.riff-global-aurora'),
      beams: Array.from(layer.querySelectorAll('.riff-global-beam')),
      orbs: Array.from(layer.querySelectorAll('.riff-global-orb')),
      glow: layer.querySelector('.riff-global-glow'),
      particles: [],
      emberSprites: colors.map((color) => createGlobalParticleSprite(color, false)),
      bokehSprites: colors.map((color) => createGlobalParticleSprite(color, true)),
    };
    const count = reduced ? (lowPower ? 32 : 48) : (lowPower ? 46 : 120);

    for (let index = 0; index < count; index += 1) {
      const bokeh = index % 16 === 0;
      fx.particles.push({
        bokeh,
        tone: index % colors.length,
        x: Math.random() * fx.width,
        y: Math.random() * fx.height,
        size: bokeh ? 42 + Math.random() * 72 : 2.4 + Math.random() * 4.4,
        rise: bokeh ? 5 + Math.random() * 10 : 18 + Math.random() * 44,
        sway: bokeh ? 10 + Math.random() * 22 : 6 + Math.random() * 16,
        swaySpeed: 0.25 + Math.random() * 0.9,
        twinkleSpeed: 0.45 + Math.random() * 1.35,
        phase: Math.random() * Math.PI * 2,
        alpha: bokeh ? 0.075 + Math.random() * 0.09 : 0.28 + Math.random() * 0.36,
        depth: bokeh ? 6 + Math.random() * 10 : 4 + Math.random() * 16,
        wobble: 2 + Math.random() * 6,
      });
    }

    fx.resize = () => {
      if (globalFx !== fx) return;
      const oldWidth = fx.width;
      const oldHeight = fx.height;
      const width = Math.max(1, layer.clientWidth || window.innerWidth);
      const height = Math.max(1, layer.clientHeight || window.innerHeight);
      const dpr = window.devicePixelRatio || 1;
      const maxPixels = lowPower ? 1200000 : 3000000;
      const scale = Math.max(0.5, Math.min(dpr, 1.5, Math.sqrt(maxPixels / (width * height))));
      fx.width = width;
      fx.height = height;
      fx.scale = scale;
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      for (const particle of fx.particles) {
        particle.x *= width / oldWidth;
        particle.y *= height / oldHeight;
      }
      drawGlobalParticles();
    };

    fx.start = () => {
      if (globalFx !== fx || fx.reduced || fx.raf) return;
      if (document.hidden || fx.paused || !document.hasFocus()) return;
      fx.last = performance.now();
      const loop = (now) => {
        if (globalFx !== fx) return;
        fx.raf = 0;
        if (fx.paused || document.hidden) return;
        if (now - fx.last >= fx.frameInterval) {
          const delta = Math.min(0.1, (now - fx.last) / 1000);
          fx.time += delta;
          if (now - fx.lastAmbient >= fx.ambientInterval) {
            updateGlobalAmbient(fx, fx.time);
            fx.lastAmbient = now;
          }
          stepGlobalParticles(delta);
          drawGlobalParticles();
          fx.last = now;
        }
        fx.raf = requestAnimationFrame(loop);
      };
      fx.raf = requestAnimationFrame(loop);
    };

    fx.pause = () => {
      fx.paused = true;
      if (fx.raf) cancelAnimationFrame(fx.raf);
      fx.raf = 0;
    };

    fx.resume = () => {
      if (document.hidden) return;
      fx.paused = false;
      fx.last = performance.now();
      updateGlobalAmbient(fx, fx.time);
      drawGlobalParticles();
      fx.start();
    };

    fx.onResize = () => {
      if (fx.resizeRaf) return;
      fx.resizeRaf = requestAnimationFrame(() => {
        fx.resizeRaf = 0;
        fx.resize();
      });
    };
    fx.onVisibility = () => {
      if (document.hidden) fx.pause();
      else fx.resume();
    };
    fx.onPause = () => fx.pause();
    fx.onResume = () => fx.resume();

    globalFx = fx;
    window.addEventListener('resize', fx.onResize, { passive: true });
    document.addEventListener('visibilitychange', fx.onVisibility);
    window.addEventListener('blur', fx.onPause);
    window.addEventListener('focus', fx.onResume);

    fx.themeObserver = new MutationObserver(() => {
      if (fx.themeTimer) clearTimeout(fx.themeTimer);
      fx.themeTimer = setTimeout(() => {
        if (globalFx !== fx) return;
        const nextColors = readGlobalToneColors();
        const nextSignature = nextColors.join('|');
        if (nextSignature === fx.colorSignature) return;
        fx.colorSignature = nextSignature;
        fx.emberSprites = nextColors.map((color) => createGlobalParticleSprite(color, false));
        fx.bokehSprites = nextColors.map((color) => createGlobalParticleSprite(color, true));
        drawGlobalParticles();
      }, 240);
    });
    fx.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });

    fx.resize();
    if (!fx.reduced) {
      updateGlobalAmbient(fx, 0);
      fx.paused = document.hidden || !document.hasFocus();
      if (!fx.paused) fx.start();
    }
  }

  function applyGlobalBackdrop() {
    const enabled = profileBackgroundEnabled();
    let layer = document.getElementById('riff-global-bg');

    if (!enabled) {
      stopGlobalFx();
      if (globalParallaxFrame) cancelAnimationFrame(globalParallaxFrame);
      globalParallaxFrame = 0;
      globalParallaxPoint = null;
      if (layer) layer.remove();
      document.body.classList.remove('riff-global-bg-on');
      return;
    }

    if (!layer) {
      document.body.insertAdjacentHTML('afterbegin', globalBackdropMarkup());
      layer = document.getElementById('riff-global-bg');
      initGlobalFx();
    } else if (!globalFx) {
      initGlobalFx();
    }

    document.body.classList.add('riff-global-bg-on');
  }

  function profileBackgroundMarkup() {
    const particles = Array.from({ length: 64 }, (_, index) => {
      const bokeh = index % 9 === 0;
      const x = (index * 37 + 11) % 100;
      const y = (index * 53 + 7) % 100;
      const size = bokeh ? 26 + (index % 5) * 14 : 1 + (index % 3);
      const duration = bokeh ? 24 + (index % 6) * 3 : 10 + (index % 8) * 2.4;
      const delay = -((index % 11) * 1.6);
      return `<span class="rp-bg-particle${bokeh ? ' is-bokeh' : ''}" style="--x:${x}%;--y:${y}%;--s:${size}px;--d:${duration}s;--delay:${delay}s"></span>`;
    }).join('');

    return `
      <div class="rp-bg" id="rp-bg" aria-hidden="true">
        <span class="rp-bg-aurora"></span>
        <span class="rp-bg-beam b1"></span>
        <span class="rp-bg-beam b2"></span>
        <span class="rp-bg-orb o1"></span>
        <span class="rp-bg-orb o2"></span>
        <span class="rp-bg-orb o3"></span>
        <span class="rp-bg-orb o4"></span>
        <span class="rp-bg-orb o5"></span>
        <span class="rp-bg-glow"></span>
        <span class="rp-bg-noise"></span>
        ${particles}
      </div>
    `;
  }

  function updateBackgroundParallax(event) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const root = $('#profile-root');
    if (!root) return;
    const rect = root.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2, -1, 1);
    const y = clamp(((event.clientY - rect.top) / rect.height - 0.5) * 2, -1, 1);
    root.style.setProperty('--rp-px', x.toFixed(3));
    root.style.setProperty('--rp-py', y.toFixed(3));
  }

  function resetBackgroundParallax() {
    const root = $('#profile-root');
    if (root) {
      root.style.setProperty('--rp-px', '0');
      root.style.setProperty('--rp-py', '0');
    }
    const layer = document.getElementById('riff-global-bg');
    if (layer) {
      layer.style.setProperty('--rg-px', '0');
      layer.style.setProperty('--rg-py', '0');
    }
    globalParallaxPoint = null;
    if (globalParallaxFrame) cancelAnimationFrame(globalParallaxFrame);
    globalParallaxFrame = 0;
    if (globalFx) {
      globalFx.parallaxX = 0;
      globalFx.parallaxY = 0;
    }
  }

  function updateGlobalBackgroundParallax(event) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const layer = document.getElementById('riff-global-bg');
    if (!layer) return;
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    globalParallaxPoint = {
      x: clamp((event.clientX / width) * 2 - 1, -1, 1),
      y: clamp((event.clientY / height) * 2 - 1, -1, 1),
    };
    if (globalParallaxFrame) return;
    globalParallaxFrame = requestAnimationFrame(() => {
      globalParallaxFrame = 0;
      if (!globalParallaxPoint) return;
      layer.style.setProperty('--rg-px', globalParallaxPoint.x.toFixed(3));
      layer.style.setProperty('--rg-py', globalParallaxPoint.y.toFixed(3));
      if (globalFx) {
        globalFx.parallaxX = globalParallaxPoint.x;
        globalFx.parallaxY = globalParallaxPoint.y;
      }
    });
  }

  function applyProfileBackground() {
    const root = $('#profile-root');
    const enabled = profileBackgroundEnabled();
    if (root) root.classList.toggle('bg-off', !enabled);
    applyGlobalBackdrop();
  }

  function buildShell() {
    const root = $('#profile-root');
    if (!root) return;
    root.innerHTML = `
      ${profileBackgroundMarkup()}
      <div class="rp-shell">
        <div id="rp-hero-slot"></div>
        <div id="rp-now-slot"></div>
        <div class="rp-main-grid">
          <div id="rp-level-slot"></div>
          <div id="rp-stats-slot"></div>
        </div>
        <div id="rp-achievements-slot"></div>
      </div>
    `;
    applyProfileBackground();
  }

  function syncVolumeSlider() {
    const slider = document.getElementById('volume-slider');
    if (!slider) return;
    const min = Number(slider.min) || 0;
    const max = Number(slider.max) || 1;
    const value = Number(slider.value) || 0;
    const percent = max > min ? clamp(((value - min) / (max - min)) * 100, 0, 100) : 0;
    slider.style.setProperty('--vol-progress', `${percent}%`);
  }

  function renderAll() {
    if (!initialized) return;
    readProfile();
    applyProfileBackground();
    renderHero();
    renderNow();
    renderLevel();
    renderStats();
    renderAchievements();
    refreshNavAvatar();
    syncVolumeSlider();
    updateLiveUi();
  }

  function bannerFxParticles(kind) {
    const rand = (min, max) => min + Math.random() * (max - min);
    if (kind === 'stars') {
      const sparks = Array.from({ length: 16 }, () => {
        const size = rand(1.4, 3.1).toFixed(1);
        return `<i class="rp-fx-spark" style="left:${rand(2, 98).toFixed(2)}%;top:${rand(4, 96).toFixed(2)}%;width:${size}px;height:${size}px;--tw:${rand(2.2, 5.4).toFixed(1)}s;--tw-delay:-${rand(0, 5).toFixed(1)}s"></i>`;
      }).join('');
      return `${sparks}<span class="rp-fx-shoot"></span><span class="rp-fx-shoot is-second"></span>`;
    }
    if (kind === 'embers') {
      const embers = Array.from({ length: 22 }, () => {
        const size = rand(2, 5).toFixed(1);
        const dur = rand(5.5, 12).toFixed(1);
        return `<i class="rp-fx-ember" style="--x:${rand(1, 99).toFixed(2)}%;--s:${size}px;--dur:${dur}s;--delay:-${rand(0, 12).toFixed(1)}s"></i>`;
      }).join('');
      return `<span class="rp-fx-heat"></span>${embers}`;
    }
    if (kind === 'fog') {
      return ['m1', 'm2', 'm3', 'm4'].map((name) =>
        `<i class="rp-fx-mist ${name}" style="--dx:${rand(-6, 6).toFixed(1)}%;--dy:${rand(-5, 5).toFixed(1)}%;--dur:${rand(16, 26).toFixed(0)}s"></i>`
      ).join('');
    }
    if (kind === 'aurora') {
      return '<span class="rp-fx-ribbon r1"></span><span class="rp-fx-ribbon r2"></span><span class="rp-fx-ribbon r3"></span><span class="rp-fx-aurora-glow"></span>';
    }
    return '';
  }

  function renderHero() {
    const slot = $('#rp-hero-slot');
    if (!slot) return;

    if (editing) {
      renderEdit(slot);
      return;
    }

    const nick = String(profile.nick || 'User');
    const handle = profile.handle || normalizeHandle(nick);
    const avatar = String(profile.avatar || '');
    const banner = String(profile.banner || '');
    const bannerFx = String(profile.bannerFx || '');
    const bio = String(profile.bio || '');
    const status = String(profile.status || '');
    const xp = progression().totalXP;
    const rp = getRankProgress(xp);
    const rankName = t(rp.rank.labelKey);
    const xpText = rp.nextRank
      ? t('level.range', { current: formatNumber(rp.xpIntoRank), total: formatNumber(rp.xpForRank) })
      : `${formatNumber(xp)} XP`;

    slot.innerHTML = `
      <div class="rp-hero ${banner ? 'has-banner' : ''} ${bannerFx ? `banner-fx-${bannerFx}` : ''}">
        <div class="rp-hero-bg">
          ${banner ? `<img src="${escapeHtml(banner)}" alt="" draggable="false" onerror="this.style.display='none'">` : ''}
          <div class="rp-hero-shade"></div>
          <div class="rp-hero-fx" aria-hidden="true">
            <span class="rp-fx-layer rp-fx-a"></span>
            <span class="rp-fx-layer rp-fx-b"></span>
            <span class="rp-fx-layer rp-fx-c"></span>
            ${bannerFx ? bannerFxParticles(bannerFx) : ''}
          </div>
        </div>
        <div class="rp-hero-top">
          <button type="button" class="rp-edit-open" data-rp-action="edit">${ICONS.pencil} ${escapeHtml(t('hero.edit'))}</button>
        </div>
        <div class="rp-hero-bottom">
          <div class="rp-hero-row">
            <div class="rp-avatar-wrap">
              <div class="rp-avatar-ring"></div>
              <div class="rp-avatar-ring-inner"></div>
              <div class="rp-avatar">
                ${avatar
                  ? `<img src="${escapeHtml(avatar)}" alt="" draggable="false" onerror="this.style.display='none'">`
                  : `<span class="rp-avatar-initial">${escapeHtml(initialOf(nick))}</span>`}
              </div>
              <div class="rp-rank-badge">
                <img src="${rankIcon(rp.rank)}" alt="" draggable="false" onerror="this.style.display='none'">
              </div>
            </div>
            <div class="rp-hero-meta">
              <div class="rp-name-row">
                <h2 class="rp-nick">${escapeHtml(nick)}</h2>
                <span class="rp-verified" title="Noctra">${ICONS.check}</span>
              </div>
              <p class="rp-handle">${escapeHtml(handle)}</p>
              ${bio ? `<p class="rp-bio">${escapeHtml(bio)}</p>` : ''}
              ${status ? `<p class="rp-status">${escapeHtml(status)}</p>` : ''}
            </div>
          </div>
          <div class="rp-rank-row">
            <span class="rp-rank-pill">${ICONS.shield} ${escapeHtml(rankName)}</span>
            <div class="rp-xp-wrap">
              <div class="rp-xp-track">
                <div class="rp-xp-fill" id="rp-hero-xp-fill" style="width:${rp.percent}%"></div>
              </div>
              <span class="rp-xp-text" id="rp-hero-xp-text">${escapeHtml(xpText)}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderEdit(slot) {
    const draft = editDraft || {};
    const nick = String(draft.nick || '');
    const avatar = String(draft.avatar || '');
    const banner = String(draft.banner || '');
    const bannerFx = String(draft.bannerFx || '');

    slot.innerHTML = `
      <div class="rp-edit">
        <p class="rp-edit-title">${escapeHtml(t('edit.title'))}</p>
        <div class="rp-edit-cover-wrap">
          <div class="rp-edit-cover ${bannerFx ? `banner-fx-${bannerFx}` : ''}">
            ${banner ? `<img src="${escapeHtml(banner)}" alt="" draggable="false">` : ''}
            <div class="rp-edit-cover-actions">
              <button type="button" class="rp-file-btn" data-rp-action="pick-banner">${ICONS.image} ${escapeHtml(t('edit.cover'))}</button>
              ${banner ? `<button type="button" class="rp-file-btn" data-rp-action="clear-banner" title="${escapeHtml(t('edit.remove'))}">${ICONS.x}</button>` : ''}
            </div>
          </div>
          <div class="rp-edit-avatar" data-rp-action="pick-avatar" title="${escapeHtml(t('edit.avatar'))}">
            ${avatar
              ? `<img src="${escapeHtml(avatar)}" alt="" draggable="false">`
              : `<span class="rp-avatar-initial">${escapeHtml(initialOf(nick || profile.nick))}</span>`}
            <span class="rp-edit-avatar-overlay">${escapeHtml(t('edit.avatar'))}</span>
          </div>
        </div>
        <div class="rp-fields">
          <div class="rp-field-row">
            <label class="rp-field">
              <span class="rp-label">${escapeHtml(t('edit.nick'))}</span>
              <input class="rp-input" data-rp-field="nick" maxlength="48" value="${escapeHtml(draft.nick || '')}" autocomplete="off">
            </label>
            <label class="rp-field">
              <span class="rp-label">${escapeHtml(t('edit.handle'))}</span>
              <input class="rp-input" data-rp-field="handle" maxlength="48" value="${escapeHtml(draft.handle || '')}" autocomplete="off">
            </label>
          </div>
          <label class="rp-field">
            <span class="rp-label">${escapeHtml(t('edit.status'))}</span>
            <input class="rp-input" data-rp-field="status" maxlength="120" value="${escapeHtml(draft.status || '')}" autocomplete="off">
          </label>
          <label class="rp-field">
            <span class="rp-label">${escapeHtml(t('edit.bio'))}</span>
            <textarea class="rp-textarea" data-rp-field="bio" maxlength="280">${escapeHtml(draft.bio || '')}</textarea>
          </label>
        </div>
        <div class="rp-fx-field">
          <span class="rp-label">Эффект баннера</span>
          <div class="rp-fx-options">
            ${BANNER_EFFECTS.map((effect) => `
              <button type="button" class="rp-fx-option ${bannerFx === effect.id ? 'active' : ''}" data-rp-action="set-banner-fx" data-fx="${effect.id}">${escapeHtml(effect.label)}</button>
            `).join('')}
          </div>
        </div>
        ${editError ? `<p class="rp-edit-error">${escapeHtml(editError)}</p>` : ''}
        <div class="rp-edit-actions">
          <button type="button" class="rp-btn rp-btn-primary" data-rp-action="save-edit">${ICONS.check} ${escapeHtml(t('edit.save'))}</button>
          <button type="button" class="rp-btn" data-rp-action="cancel-edit">${escapeHtml(t('edit.cancel'))}</button>
        </div>
      </div>
    `;
  }

  function renderNow() {
    const slot = $('#rp-now-slot');
    if (!slot) return;

    const snap = lastSnapshot || (bridge ? bridge.getPlaybackSnapshot() : null);
    const track = snap && snap.track;

    if (!track) {
      slot.innerHTML = `
        <div class="rp-card rp-now">
          <div class="rp-card-head">
            <p class="rp-eyebrow">${ICONS.headphones} ${escapeHtml(t('now.title'))}</p>
          </div>
          <div class="rp-now-empty">
            ${ICONS.headphones}
            <strong>${escapeHtml(t('now.empty'))}</strong>
            <span>${escapeHtml(t('now.pick'))}</span>
          </div>
        </div>
      `;
      return;
    }

    const upcoming = Array.isArray(snap.upcoming) ? snap.upcoming : [];
    const source = track.source || 'Noctra';
    const cover = track.cover || '';

    slot.innerHTML = `
      <div class="rp-card rp-now">
        <div class="rp-card-head">
          <p class="rp-eyebrow">${ICONS.headphones} ${escapeHtml(t('now.title'))}</p>
          <span class="rp-source-badge">${escapeHtml(source)}</span>
        </div>
        <div class="rp-now-body">
          <div class="rp-now-main">
            <div class="rp-now-head">
              <div class="rp-now-cover">
                ${cover
                  ? `<img src="${escapeHtml(cover)}" alt="" draggable="false" onerror="this.style.display='none'">`
                  : ICONS.music}
              </div>
              <div class="rp-now-info">
                <p class="rp-now-title">${escapeHtml(track.title)}</p>
                <p class="rp-now-artist">${escapeHtml(track.artist)}</p>
              </div>
            </div>
            <div class="rp-now-controls">
              <button type="button" class="rp-ctrl ${snap.isShuffle ? 'is-active' : ''}" data-rp-action="toggle-shuffle" title="${escapeHtml(t('now.shuffle'))}">${ICONS.shuffle}</button>
              <button type="button" class="rp-ctrl" data-rp-action="prev" title="${escapeHtml(t('now.previous'))}">${ICONS.prev}</button>
              <button type="button" class="rp-play" id="rp-now-play" data-rp-action="toggle-play" title="${escapeHtml(t('now.play'))}">${snap.isPlaying ? ICONS.pause : ICONS.play}</button>
              <button type="button" class="rp-ctrl" data-rp-action="next" title="${escapeHtml(t('now.next'))}">${ICONS.next}</button>
              <button type="button" class="rp-ctrl ${snap.isRepeat ? 'is-active' : ''}" data-rp-action="toggle-repeat" title="${escapeHtml(t('now.repeat'))}">${ICONS.repeat}</button>
            </div>
            <div class="rp-seek-row">
              <span id="rp-now-cur">${formatClock(snap.currentTime)}</span>
              <div class="rp-seek-control">
                <div class="rp-seek-rail" aria-hidden="true">
                  <span class="rp-seek-fill" id="rp-now-fill" style="width:${snap.duration > 0 ? clamp((snap.currentTime / snap.duration) * 100, 0, 100) : 0}%"></span>
                </div>
                <input class="rp-range sl-done" id="rp-now-seek" type="range" min="0" max="${Math.max(0, snap.duration)}" step="0.1" value="${Math.min(snap.currentTime, snap.duration || 0)}" ${snap.duration > 0 ? '' : 'disabled'}>
              </div>
              <span id="rp-now-dur">${formatClock(snap.duration || track.duration)}</span>
            </div>
          </div>
          <div class="rp-now-divider"></div>
          <div class="rp-queue">
            <p class="rp-queue-title">${escapeHtml(t('now.queue'))}</p>
            ${upcoming.length === 0
              ? `<p class="rp-queue-empty">${escapeHtml(t('now.emptyQueue'))}</p>`
              : `<div class="rp-queue-list">${upcoming.map((item, index) => `
                  <button type="button" class="rp-queue-row" data-rp-action="play-upcoming" data-offset="${index}" title="${escapeHtml(t('now.play'))}">
                    <span class="rp-queue-cover">${item.cover ? `<img src="${escapeHtml(item.cover)}" alt="" draggable="false" onerror="this.style.display='none'">` : ICONS.music}</span>
                    <span class="rp-queue-meta">
                      <span class="rp-queue-name">${escapeHtml(item.title)}</span>
                      <span class="rp-queue-artist">${escapeHtml(item.artist)}</span>
                    </span>
                    <span class="rp-queue-play">${ICONS.play}</span>
                  </button>
                `).join('')}</div>`}
          </div>
        </div>
      </div>
    `;

    updateNowLive(snap);
  }

  function renderLevel() {
    const slot = $('#rp-level-slot');
    if (!slot) return;

    const xp = progression().totalXP;
    const rp = getRankProgress(xp);
    const rankName = t(rp.rank.labelKey);

    slot.innerHTML = `
      <div class="rp-card rp-level-card rp-corners">
        <div class="rp-card-head">
          <p class="rp-eyebrow">${ICONS.shield} ${escapeHtml(t('level.label'))} ${rp.rank.tier}</p>
        </div>
        <div class="rp-level-top">
          <div class="rp-crest">
            <img src="${rankIcon(rp.rank)}" alt="" draggable="false" onerror="this.style.display='none'">
          </div>
          <div>
            <p class="rp-level-label">${escapeHtml(t('level.label'))} ${rp.rank.tier}</p>
            <p class="rp-level-name" id="rp-level-name">${escapeHtml(rankName)}</p>
            <p class="rp-level-xp" id="rp-level-xp">${formatNumber(xp)} XP</p>
          </div>
        </div>
        <div class="rp-level-progress">
          <div class="rp-level-progress-top">
            <span id="rp-level-next">${rp.nextRank ? `${escapeHtml(t('level.next'))}: ${escapeHtml(t(rp.nextRank.labelKey))}` : escapeHtml(t('level.max'))}</span>
            ${rp.nextRank ? `<span>${escapeHtml(t('level.remaining', { xp: formatNumber(rp.xpToNext) }))}</span>` : ''}
          </div>
          <div class="rp-level-track">
            <div class="rp-level-fill" id="rp-level-fill" style="width:${rp.percent}%"></div>
          </div>
          ${rp.nextRank ? `<div class="rp-level-progress-bottom" id="rp-level-bottom">${formatNumber(rp.xpIntoRank)} / ${formatNumber(rp.xpForRank)} XP</div>` : ''}
        </div>
        <div class="rp-quests">
          <p class="rp-quests-title">${escapeHtml(t('quests.title'))}</p>
          <div class="rp-quest-list">
            ${QUESTS.map((quest) => renderQuestCard(quest)).join('')}
          </div>
        </div>
      </div>
    `;

    lastQuestState = questStateKey();
    updateQuestBars();
  }

  function questStateKey() {
    return QUESTS.map((quest) => {
      const progress = Math.min(getQuestProgress(quest.id), quest.target);
      const done = progress >= quest.target;
      const claimed = progression().daily.quests[quest.id].claimed;
      return `${quest.id}:${done ? 1 : 0}:${claimed ? 1 : 0}`;
    }).join('|');
  }

  function renderQuestCard(quest) {
    const progress = Math.min(getQuestProgress(quest.id), quest.target);
    const done = progress >= quest.target;
    const claimed = progression().daily.quests[quest.id].claimed;
    const percent = Math.round((progress / quest.target) * 100);
    const countdown = formatCountdown(secondsUntilTomorrow());
    const fly = claimFx && claimFx.id === quest.id;

    return `
      <div class="rp-quest ${done ? 'is-done' : ''} ${claimed ? 'is-claimed' : ''}" data-rp-quest="${quest.id}">
        <div class="rp-quest-top">
          <p class="rp-quest-name">${escapeHtml(t(quest.titleKey))}</p>
          <button type="button" class="rp-quest-info" data-rp-action="quest-info" data-quest="${quest.id}" title="${escapeHtml(t('quest.more'))}">${ICONS.info}</button>
        </div>
        <div class="rp-quest-bar">
          <div class="rp-quest-fill" data-rp-quest-fill="${quest.id}" style="width:${percent}%"></div>
        </div>
        ${done && !claimed
          ? `<button type="button" class="rp-quest-claim" data-rp-action="claim-quest" data-quest="${quest.id}">${escapeHtml(t('quest.readyClaim'))}</button>`
          : `<div class="rp-quest-bottom">
              <span data-rp-quest-label="${quest.id}">${escapeHtml(questProgressText(quest.id, progress, quest.target))}</span>
              ${claimed
                ? `<span data-rp-countdown>${escapeHtml(t('quest.availableIn'))} ${countdown}</span>`
                : `<span class="rp-quest-reward">${ICONS.gift} +${quest.rewardXP} XP</span>`}
            </div>${claimed ? `<p class="rp-quest-bottom" style="justify-content:center">${escapeHtml(t('quest.availableIn'))} <span data-rp-countdown>${countdown}</span></p>` : ''}`}
        ${fly ? `<span class="rp-quest-fly">${ICONS.check} +${claimFx.xp} XP</span>` : ''}
      </div>
    `;
  }

  function renderStats() {
    const slot = $('#rp-stats-slot');
    if (!slot) return;

    const p = progression();
    const dates = activeDates();
    const activeThisWeek = countActiveDaysThisWeek(dates);
    const stats = [
      {
        key: 'listening',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M18 19a2 2 0 0 1-2 2h-1"/><rect x="2" y="14" width="4" height="7" rx="2"/><rect x="18" y="14" width="4" height="7" rx="2"/></svg>',
        label: t('stats.listening'),
        value: formatListeningTime(p.totalSecondsListened),
        delta: computeDailyDelta(p.historyMap),
        period: t('stats.periodToday'),
        clickable: true,
      },
      {
        key: 'tracks',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>',
        label: t('stats.tracks'),
        value: formatNumber(p.totalTracksPlayed),
        delta: computeDailyDelta(p.tracksByDay),
        period: t('stats.periodToday'),
      },
      {
        key: 'likes',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
        label: t('stats.likes'),
        value: formatNumber(library.counts.favorites || 0),
        delta: computeDailyDelta(p.favoritesByDay),
        period: t('stats.periodToday'),
      },
      {
        key: 'activeDays',
        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8 14h2M14 14h2M8 17h2"/></svg>',
        label: t('stats.activeDays'),
        value: `${activeThisWeek} / ${ACTIVE_DAYS_PER_WEEK}`,
        delta: computeActiveDaysDelta(dates),
        period: t('stats.periodWeekTotal', { total: dates.length }),
      },
    ];

    slot.innerHTML = `
      <div class="rp-card rp-stats-card">
        <div class="rp-card-head">
          <p class="rp-eyebrow">${escapeHtml(t('stats.title'))}</p>
        </div>
        <div class="rp-stats-grid">
          ${stats.map((stat) => `
            <button type="button" class="rp-stat ${stat.clickable ? 'is-clickable' : ''}" ${stat.clickable ? 'data-rp-action="open-listening"' : ''}>
              <span class="rp-stat-top">
                <span class="rp-stat-icon">${stat.icon}</span>
                ${stat.key === 'activeDays' ? renderStreakBadges() : renderDelta(stat.delta, stat.period, stat.key)}
              </span>
              ${statChartMarkup(stat.key)}
              <span>
                <span class="rp-stat-value" data-rp-stat-value="${stat.key}">${escapeHtml(stat.value)}</span>
                <span class="rp-stat-label">${escapeHtml(stat.label)}</span>
              </span>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderDelta(delta, period, key) {
    const slot = key ? ` data-rp-delta="${key}"` : '';
    if (delta.direction === 'flat' || delta.percent === null) {
      return `<span class="rp-delta is-flat"${slot} title="${escapeHtml(period)}">0%</span>`;
    }
    const up = delta.direction === 'up';
    return `<span class="rp-delta ${up ? 'is-up' : 'is-down'}"${slot} title="${escapeHtml(period)}">${up ? '↑' : '↓'}${delta.percent >= 0 ? '+' : ''}${delta.percent}%</span>`;
  }

  function updateStatDeltas() {
    const p = progression();
    const period = t('stats.periodToday');
    const deltas = {
      listening: computeDailyDelta(p.historyMap),
      tracks: computeDailyDelta(p.tracksByDay),
      likes: computeDailyDelta(p.favoritesByDay),
    };
    Object.entries(deltas).forEach(([key, delta]) => {
      const node = document.querySelector(`[data-rp-delta="${key}"]`);
      if (node) node.outerHTML = renderDelta(delta, period, key);
    });
  }

  function renderAchievements() {
    const slot = $('#rp-achievements-slot');
    if (!slot) return;

    const metrics = getMetrics();
    const unlocked = progression().unlocked || {};
    const count = Object.keys(unlocked).length;
    const visible = achievementsExpanded ? ACHIEVEMENTS : ACHIEVEMENTS.slice(0, 6);
    const hidden = ACHIEVEMENTS.length - 6;

    slot.innerHTML = `
      <div class="rp-card">
        <div class="rp-card-head">
          <p class="rp-eyebrow">${ICONS.sparkles} ${escapeHtml(t('achievements.title'))}</p>
          <span class="rp-ach-count">${count} / ${ACHIEVEMENTS.length}</span>
        </div>
        <div class="rp-ach-grid ${achievementsExpanded ? 'is-expanded' : ''}">
          ${visible.map((achievement) => renderAchievement(achievement, metrics, Boolean(unlocked[achievement.id]))).join('')}
        </div>
        ${hidden > 0 ? `<button type="button" class="rp-ach-more" data-rp-action="toggle-achievements">${achievementsExpanded ? escapeHtml(t('achievements.showLess')) : escapeHtml(t('achievements.showAll', { count: hidden }))}</button>` : ''}
      </div>
    `;
  }

  function renderAchievement(achievement, metrics, isUnlocked) {
    const glow = RARITY_GLOW[achievement.rarity] || 0.25;
    const progress = achievementProgress(achievement, metrics, isUnlocked);
    const current = metricValue(achievement, metrics);
    const name = isUnlocked ? t(`achievement.${achievement.id}`) : t('achievements.hidden');

    return `
      <div class="rp-ach ${isUnlocked ? 'is-unlocked' : ''}" title="${escapeHtml(isUnlocked ? t(`achievement.${achievement.id}`) : t('achievements.hint'))}">
        <div class="rp-ach-icon-wrap">
          ${isUnlocked ? `<span class="rp-ach-glow" style="box-shadow:0 0 ${12 + glow * 26}px var(--rp-glow)"></span>` : ''}
          <div class="rp-ach-icon">
            <img src="${achievementIcon(achievement)}" alt="" loading="lazy" decoding="async" draggable="false">
            ${!isUnlocked ? '<span class="rp-ach-veil"></span>' : ''}
            ${isUnlocked ? '<span class="rp-ach-shine"></span>' : ''}
          </div>
        </div>
        <p class="rp-ach-name">${escapeHtml(name)}</p>
        ${!isUnlocked && progress !== null
          ? `<div class="rp-ach-progress">
              <div class="rp-ach-track"><div class="rp-ach-fill" data-rp-ach-fill="${achievement.id}" style="width:${progress}%"></div></div>
              ${achievement.target !== null ? `<p class="rp-ach-numbers" data-rp-ach-numbers="${achievement.id}">${Math.min(current, achievement.target)} / ${achievement.target}</p>` : ''}
            </div>`
          : ''}
      </div>
    `;
  }

  /* ── live updates ───────────────────────────────────────────────────── */

  function updateXpUi() {
    if (!initialized) return;
    const p = progression();
    const rp = getRankProgress(p.totalXP);
    const xpText = rp.nextRank
      ? t('level.range', { current: formatNumber(rp.xpIntoRank), total: formatNumber(rp.xpForRank) })
      : `${formatNumber(p.totalXP)} XP`;

    const heroFill = $('#rp-hero-xp-fill');
    const heroText = $('#rp-hero-xp-text');
    if (heroFill) heroFill.style.width = `${rp.percent}%`;
    if (heroText) heroText.textContent = xpText;

    const levelFill = $('#rp-level-fill');
    const levelXp = $('#rp-level-xp');
    const levelName = $('#rp-level-name');
    const levelNext = $('#rp-level-next');
    const levelBottom = $('#rp-level-bottom');
    if (levelFill) levelFill.style.width = `${rp.percent}%`;
    if (levelXp) levelXp.textContent = `${formatNumber(p.totalXP)} XP`;
    if (levelName) levelName.textContent = t(rp.rank.labelKey);
    if (levelNext) {
      levelNext.textContent = rp.nextRank
        ? `${t('level.next')}: ${t(rp.nextRank.labelKey)}`
        : t('level.max');
    }
    if (levelBottom) {
      levelBottom.textContent = `${formatNumber(rp.xpIntoRank)} / ${formatNumber(rp.xpForRank)} XP`;
    }
  }

  function updateNowLive(snap) {
    if (!snap || !snap.track) return;
    const current = $('#rp-now-cur');
    const duration = $('#rp-now-dur');
    const seek = $('#rp-now-seek');
    const seekFill = $('#rp-now-fill');
    const play = $('#rp-now-play');

    if (current) current.textContent = formatClock(snap.currentTime);
    if (duration) duration.textContent = formatClock(snap.duration || snap.track.duration);
    if (seek && !isSeekingTrack) {
      seek.max = String(Math.max(0, snap.duration || 0));
      seek.value = String(Math.min(snap.currentTime || 0, snap.duration || 0));
      const percent = snap.duration > 0 ? clamp((snap.currentTime / snap.duration) * 100, 0, 100) : 0;
      seek.style.setProperty('--rp-progress', `${percent}%`);
      if (seekFill) seekFill.style.width = `${percent}%`;
      seek.disabled = !(snap.duration > 0);
    }
    if (play) play.innerHTML = snap.isPlaying ? ICONS.pause : ICONS.play;

    const shuffle = $('[data-rp-action="toggle-shuffle"]');
    const repeat = $('[data-rp-action="toggle-repeat"]');
    if (shuffle) shuffle.classList.toggle('is-active', Boolean(snap.isShuffle));
    if (repeat) repeat.classList.toggle('is-active', Boolean(snap.isRepeat));
  }

  function updateQuestBars() {
    if (!initialized) return;
    const p = progression();
    const countdown = formatCountdown(secondsUntilTomorrow());

    QUESTS.forEach((quest) => {
      const progress = Math.min(getQuestProgress(quest.id), quest.target);
      const percent = Math.round((progress / quest.target) * 100);
      const fill = $(`[data-rp-quest-fill="${quest.id}"]`);
      const label = $(`[data-rp-quest-label="${quest.id}"]`);
      if (fill) fill.style.width = `${percent}%`;
      if (label) label.textContent = questProgressText(quest.id, progress, quest.target);
    });

    $$('[data-rp-countdown]').forEach((node) => {
      node.textContent = countdown;
    });

    $$('[data-rp-quest]').forEach((node) => {
      const id = node.getAttribute('data-rp-quest');
      const quest = QUESTS.find((item) => item.id === id);
      if (!quest) return;
      const progress = Math.min(getQuestProgress(id), quest.target);
      const done = progress >= quest.target;
      const claimed = p.daily.quests[id].claimed;
      node.classList.toggle('is-done', done && !claimed);
      node.classList.toggle('is-claimed', claimed);
    });
  }

  function updateAchievementProgress() {
    if (!initialized || !isProfileActive()) return;
    const metrics = getMetrics();
    const unlocked = progression().unlocked || {};
    ACHIEVEMENTS.forEach((achievement) => {
      if (unlocked[achievement.id]) return;
      const progress = achievementProgress(achievement, metrics, false);
      const fill = $(`[data-rp-ach-fill="${achievement.id}"]`);
      const numbers = $(`[data-rp-ach-numbers="${achievement.id}"]`);
      if (fill && progress !== null) fill.style.width = `${progress}%`;
      if (numbers && achievement.target !== null) {
        const current = metricValue(achievement, metrics);
        numbers.textContent = `${Math.min(current, achievement.target)} / ${achievement.target}`;
      }
    });
  }

  function updateStatsValues() {
    if (!initialized || !isProfileActive()) return;
    const p = progression();
    const dates = activeDates();
    const values = {
      listening: formatListeningTime(p.totalSecondsListened),
      tracks: formatNumber(p.totalTracksPlayed),
      likes: formatNumber(library.counts.favorites || 0),
      activeDays: `${countActiveDaysThisWeek(dates)} / ${ACTIVE_DAYS_PER_WEEK}`,
    };
    Object.entries(values).forEach(([key, value]) => {
      const node = $(`[data-rp-stat-value="${key}"]`);
      if (node) node.textContent = value;
    });
    ['listening', 'tracks', 'likes', 'activeDays'].forEach(updateStatChart);
    updateStreakBadges();
    updateStatDeltas();
  }

  function updateLiveUi() {
    if (!initialized) return;
    const active = isProfileActive();
    isVisible = active;

    if (!active) {
      if (activeModal) closeModal();
      if (waveformRaf) {
        cancelAnimationFrame(waveformRaf);
        waveformRaf = 0;
      }
      return;
    }

    rolloverIfNeeded();

    const snap = bridge ? bridge.getPlaybackSnapshot() : null;
    lastSnapshot = snap;

    if (snap && snap.track) {
      updateNowLive(snap);
    }

    updateXpUi();
    updateStatsValues();
    updateQuestBars();
    updateAchievementProgress();

    const questKey = questStateKey();
    if (questKey !== lastQuestState) {
      lastQuestState = questKey;
      renderLevel();
    }

    const signature = profileSignature();
    if (signature !== lastProfileSignature && !editing) {
      lastProfileSignature = signature;
      readProfile();
      renderHero();
      refreshNavAvatar();
    }
  }

  /* ── waveform ───────────────────────────────────────────────────────── */

  function startWaveform() {
    if (waveformRaf) cancelAnimationFrame(waveformRaf);
    if (!isProfileActive()) return;

    const bars = $$('#rp-wave .rp-wave-bar');
    if (!bars.length) return;

    const frame = () => {
      if (!isProfileActive()) {
        waveformRaf = 0;
        return;
      }

      const snap = bridge ? bridge.getPlaybackSnapshot() : null;
      const levels = snap && snap.isPlaying ? bridge.getAudioLevels(bars.length) : null;
      waveformPhase += 0.12;

      bars.forEach((bar, index) => {
        let target;
        if (levels) {
          target = levels[index] || 0;
        } else if (snap && snap.isPlaying) {
          target = 0.2 + 0.4 * (
            0.5 + 0.5 * Math.sin(waveformPhase + index * 0.35) *
            Math.sin(waveformPhase * 0.5 + index * 0.1)
          );
        } else {
          target = 0.06;
        }

        const previous = Number(bar.dataset.level) || 0.06;
        const smoothing = levels ? 0.45 : 0.18;
        const next = previous + (target - previous) * smoothing;
        bar.dataset.level = String(next);
        bar.style.height = `${Math.max(6, Math.min(100, next * 100))}%`;
        bar.style.opacity = String(0.35 + Math.min(0.65, next));
      });

      waveformRaf = requestAnimationFrame(frame);
    };

    waveformRaf = requestAnimationFrame(frame);
  }

  /* ── progression events ─────────────────────────────────────────────── */

  function addListening(seconds, track) {
    if (!(seconds > 0)) return;
    const p = progression();
    rolloverIfNeeded();

    const key = today();
    const previousDaySeconds = p.daily.listenedSeconds;
    const nextDaySeconds = previousDaySeconds + seconds;
    const gainedXp = Math.floor(nextDaySeconds / XP_PER_LISTEN_SECONDS) - Math.floor(previousDaySeconds / XP_PER_LISTEN_SECONDS);

    p.totalSecondsListened += seconds;
    p.historyMap[key] = (p.historyMap[key] || 0) + seconds / 60;
    p.daily.listenedSeconds = nextDaySeconds;

    const now = Date.now();
    const gap = p.lastTickAt > 0 ? (now - p.lastTickAt) / 1000 : 0;
    const newSession = gap > SESSION_BREAK_SECONDS;
    p.currentSessionSeconds = newSession ? seconds : p.currentSessionSeconds + seconds;
    p.lastTickAt = now;
    p.counters.maxSessionSeconds = Math.max(p.counters.maxSessionSeconds, Math.round(p.currentSessionSeconds));

    if (track && track.source) registerSource(track.source);

    if (gainedXp > 0) p.totalXP += gainedXp;
    scheduleSave();

    if (gainedXp > 0) updateXpUi();

    if (p.daily.listenedSeconds >= 30 * 60) {
      const questKey = questStateKey();
      if (questKey !== lastQuestState) {
        lastQuestState = questKey;
        if (isProfileActive()) renderLevel();
      }
    }
  }

  function handleTrackChange(snap) {
    if (!snap || !snap.track) return;
    const p = progression();
    const track = snap.track;

    if (track.source) registerSource(track.source);

    if (p.lastTrackId === null) {
      p.lastTrackId = track.id;
      scheduleSave();
      return;
    }

    if (track.id !== p.lastTrackId) {
      if (snap.isShuffle) {
        p.shuffleRun += 1;
        p.counters.shuffleStreak = Math.max(p.counters.shuffleStreak, p.shuffleRun);
      } else {
        p.shuffleRun = 0;
      }

      p.repeatRun = 0;
      p.lastTrackId = track.id;
      scheduleSave();
      return;
    }

    const previous = lastSnapshot;
    const restarted = previous &&
      previous.track &&
      previous.track.id === track.id &&
      snap.currentTime < 2 &&
      previous.currentTime > Math.max(3, (previous.duration || 0) * 0.7);

    if (restarted) {
      p.repeatRun += 1;
      p.counters.repeatLoops = Math.max(p.counters.repeatLoops, p.repeatRun);
      scheduleSave();
    }

    if (!snap.isShuffle && p.shuffleRun !== 0) {
      p.shuffleRun = 0;
      scheduleSave();
    }
  }

  function recordTrackCompletion(track) {
    if (!initialized || !track || !track.id) return;

    /*
     * Один проигранный трек = одно засчитанное прослушивание.
     *
     * Событие ended приходит не всегда: Riff может переключить трек через
     * crossfade/автопереход раньше, чем нативный <audio> успеет сообщить
     * об окончании. currentPlay гасит двойной учёт, если окончание успели
     * заметить и по прогрессу, и по событию ended.
     */
    if (currentPlay && currentPlay.id === track.id) {
      if (currentPlay.completed) return;
      currentPlay.completed = true;
    }

    const p = progression();
    rolloverIfNeeded();
    const key = today();
    const hour = new Date().getHours();
    const isNight = hour >= NIGHT_START_HOUR && hour < NIGHT_END_HOUR;

    p.totalTracksPlayed += 1;
    p.tracksByDay[key] = (p.tracksByDay[key] || 0) + 1;
    p.daily.completedTracks += 1;
    if (isNight) p.counters.nightPlays += 1;

    if (lastSnapshot && lastSnapshot.isRepeat && p.lastTrackId === track.id) {
      p.repeatRun += 1;
      p.counters.repeatLoops = Math.max(p.counters.repeatLoops, p.repeatRun);
    }

    if (track.source) registerSource(track.source);

    checkAchievements();
    saveNow();
    if (isProfileActive()) {
      renderStats();
      updateStatsValues();
    }
  }

  function updateTrackCompletion(snap) {
    if (!snap || !snap.track) {
      currentPlay = null;
      return;
    }

    const track = snap.track;
    const currentTime = Number(snap.currentTime) || 0;
    const duration = Number(snap.duration) || Number(track.duration) || 0;

    if (!currentPlay || currentPlay.id !== track.id) {
      /*
       * Если предыдущий трек сменился, находясь почти в конце, значит его
       * доиграл crossfade/автопереход — засчитываем без события ended.
       */
      if (
        currentPlay &&
        !currentPlay.completed &&
        currentPlay.duration > 0 &&
        currentPlay.lastTime >= currentPlay.duration - 2
      ) {
        recordTrackCompletion(currentPlay.track);
      }

      currentPlay = {
        id: track.id,
        track,
        duration,
        lastTime: currentTime,
        completed: false,
      };
      return;
    }

    // Повтор одного трека: время откатилось в начало — это новый проход.
    const restarted =
      currentPlay.lastTime > 5 &&
      currentTime < currentPlay.lastTime - Math.max(3, duration * 0.5);

    if (restarted) currentPlay.completed = false;

    currentPlay.track = track;
    currentPlay.duration = duration;
    currentPlay.lastTime = currentTime;

    if (
      !currentPlay.completed &&
      duration > 0 &&
      currentTime >= duration - 1.2 &&
      snap.isPlaying
    ) {
      // recordTrackCompletion сам выставит completed=true и защитит от повтора.
      recordTrackCompletion(track);
    }
  }

  function onTrackEnded(track) {
    const normalized = normalizeTrack(track);
    if (!normalized || !normalized.id) return;

    /*
     * Если currentPlay уже указывает на следующий трек, значит старый
     * переход уже обработан по прогрессу — поздний ended не должен
     * задваивать счётчик.
     */
    if (currentPlay && currentPlay.id !== normalized.id) return;

    recordTrackCompletion(normalized);
  }

  function tick() {
    if (!initialized || !bridge) return;

    const snap = bridge.getPlaybackSnapshot();
    if (!snap) return;

    const now = Date.now();
    const gap = lastTickWall ? (now - lastTickWall) / 1000 : 1;
    lastTickWall = now;

    const language = currentLanguage();
    if (language !== lastLanguage) {
      lastLanguage = language;
      refreshNavAvatar();
      if (isProfileActive()) renderAll();
    }

    const bgEnabled = profileBackgroundEnabled();
    if (bgEnabled !== lastBgEnabled) {
      lastBgEnabled = bgEnabled;
      applyProfileBackground();
    }

    syncVolumeSlider();

    if (snap.track) {
      handleTrackChange(snap);
      updateTrackCompletion(snap);
      if (snap.isPlaying) {
        addListening(clamp(gap, 0.25, 5), snap.track);
      }
    }

    const trackChanged = !lastSnapshot || !lastSnapshot.track || !snap.track ||
      (lastSnapshot.track && snap.track && lastSnapshot.track.id !== snap.track.id) ||
      Boolean(lastSnapshot.track) !== Boolean(snap.track);

    lastSnapshot = snap;

    if (trackChanged && isProfileActive()) {
      renderNow();
    }

    if (now - lastAchievementCheck > 5000) {
      lastAchievementCheck = now;
      checkAchievements();
    }

    updateLiveUi();
  }

  function pollLibrary() {
    if (!initialized || !bridge || libraryPollBusy) return;
    libraryPollBusy = true;

    try {
      const snap = bridge.getLibrarySnapshot();
      if (!snap) return;

      rolloverIfNeeded();
      const p = progression();
      const key = today();
      const currentIds = Array.isArray(snap.favoriteIds) ? snap.favoriteIds : [];
      const previousIds = Array.isArray(p.lastFavoriteIds) ? p.lastFavoriteIds : null;
      const previousSet = new Set(previousIds || []);
      const newFavoriteIds = previousIds ? currentIds.filter((id) => !previousSet.has(id)) : [];

      if (previousIds && newFavoriteIds.length > 0) {
        let awarded = 0;
        newFavoriteIds.forEach((id) => {
          if (!p.favoriteXpTrackIds[id]) {
            p.favoriteXpTrackIds[id] = key;
            awarded += XP_PER_FAVORITE;
          }
        });

        if (awarded > 0) p.totalXP += awarded;
        p.favoritesByDay[key] = (p.favoritesByDay[key] || 0) + newFavoriteIds.length;
        p.daily.favoritesAdded += newFavoriteIds.length;
        saveNow();
        checkAchievements();
        if (isProfileActive()) {
          renderStats();
          updateXpUi();
        }
      }

      if (!previousIds) {
        p.lastFavoriteIds = currentIds.slice();
        scheduleSave();
      } else if (
        currentIds.length !== previousIds.length ||
        currentIds.some((id, index) => id !== previousIds[index])
      ) {
        p.lastFavoriteIds = currentIds.slice();
        scheduleSave();
      }

      const currentMax = (snap.playlists || []).reduce((max, playlist) => Math.max(max, playlist.trackCount || 0), 0);
      if (p.lastMaxPlaylistTracks === null) {
        p.lastMaxPlaylistTracks = currentMax;
        scheduleSave();
      } else {
        const grew = currentMax > p.lastMaxPlaylistTracks;
        if (grew && currentMax >= PLAYLIST_MIN_TRACKS && !p.daily.playlistXpClaimed) {
          p.totalXP += XP_PER_PLAYLIST;
          p.daily.playlistXpClaimed = true;
          p.lastMaxPlaylistTracks = currentMax;
          scheduleSave();
          checkAchievements();
          if (bridge.showToast) bridge.showToast(`+${XP_PER_PLAYLIST} XP`, 'success');
          updateXpUi();
        } else if (currentMax !== p.lastMaxPlaylistTracks) {
          p.lastMaxPlaylistTracks = currentMax;
          scheduleSave();
        }
      }

      const previousFavoriteCount = library.counts.favorites;
      const previousPlaylistCount = library.counts.playlists;
      library = {
        favoriteIds: currentIds.slice(),
        playlists: snap.playlists || [],
        counts: snap.counts || { favorites: 0, playlists: 0 },
      };

      if (isProfileActive() && (
        previousFavoriteCount !== library.counts.favorites ||
        previousPlaylistCount !== library.counts.playlists
      )) {
        renderStats();
        updateAchievementProgress();
      }
    } finally {
      libraryPollBusy = false;
    }
  }

  /* ── achievements / toasts ──────────────────────────────────────────── */

  function checkAchievements(silent) {
    if (!initialized || checkingAchievements) return;
    checkingAchievements = true;

    try {
      const p = progression();
      const metrics = getMetrics();
      const unlocked = p.unlocked || (p.unlocked = {});
      const unlockedBefore = Object.keys(unlocked).length;
      const seen = new Set(Array.isArray(p.seen) ? p.seen : []);
      const granted = new Set(Array.isArray(p.achievementXpGranted) ? p.achievementXpGranted : []);
      const fresh = [];

      ACHIEVEMENTS.forEach((achievement) => {
        if (unlocked[achievement.id]) return;
        if (!conditionMet(achievement, metrics)) return;

        unlocked[achievement.id] = Date.now();
        if (!seen.has(achievement.id)) {
          seen.add(achievement.id);
          if (!silent) fresh.push(achievement.id);
        }
      });

      /*
       * XP за достижения начисляется один раз на каждое открытое достижение.
       * Если достижение было открыто до появления этой механики, опыт за него
       * всё равно начислится при первом пересчёте — список уже оплаченных
       * достижений хранится в achievementXpGranted.
       */
      let awardedXp = 0;
      ACHIEVEMENTS.forEach((achievement) => {
        if (!unlocked[achievement.id] || granted.has(achievement.id)) return;
        granted.add(achievement.id);
        awardedXp += achievementXp(achievement);
      });

      if (awardedXp > 0) {
        p.totalXP += awardedXp;
        updateXpUi();
      }

      p.seen = Array.from(seen);
      p.achievementXpGranted = Array.from(granted);

      if (fresh.length > 0) {
        fresh.forEach((id) => queueToast(id));
        if (isProfileActive()) renderAchievements();
      } else if (isProfileActive()) {
        updateAchievementProgress();
      }

      if (Object.keys(unlocked).length > unlockedBefore || awardedXp > 0) {
        saveNow();
      }
    } finally {
      checkingAchievements = false;
    }
  }

  function queueToast(id) {
    if (!toastQueue.includes(id)) toastQueue.push(id);
    showNextToast();
  }

  function showNextToast() {
    if (toastShowing || toastQueue.length === 0) return;
    const id = toastQueue.shift();
    const achievement = ACHIEVEMENTS.find((item) => item.id === id);
    if (!achievement) {
      showNextToast();
      return;
    }

    toastShowing = true;
    const glow = RARITY_GLOW[achievement.rarity] || 0.25;
    const node = document.createElement('div');
    node.className = 'rp-toast';
    node.innerHTML = `
      <span class="rp-toast-glow" style="box-shadow: inset 0 0 ${30 + glow * 40}px color-mix(in srgb, var(--md-sys-color-primary, #a855f7) 45%, transparent)"></span>
      <span class="rp-toast-shine"></span>
      <div class="rp-toast-body">
        <span class="rp-toast-icon"><img src="${achievementIcon(achievement)}" alt="" draggable="false"></span>
        <span>
          <p class="rp-toast-label">${ICONS.sparkles} ${escapeHtml(t('achievements.unlockedTitle'))}</p>
          <p class="rp-toast-title">${escapeHtml(t(`achievement.${achievement.id}`))}</p>
          <p class="rp-toast-rarity">${escapeHtml(t(`achievements.rarity.${achievement.rarity}`))} · +${achievementXp(achievement)} XP</p>
        </span>
      </div>
    `;
    document.body.appendChild(node);

    window.setTimeout(() => {
      node.classList.add('is-leaving');
      window.setTimeout(() => {
        node.remove();
        toastShowing = false;
        showNextToast();
      }, 240);
    }, 6000);
  }

  /* ── quests ─────────────────────────────────────────────────────────── */

  function claimQuest(id) {
    rolloverIfNeeded();
    const quest = QUESTS.find((item) => item.id === id);
    if (!quest) return;
    const daily = progression().daily;
    const progress = Math.min(getQuestProgress(id), quest.target);
    if (daily.quests[id].claimed || progress < quest.target) return;

    daily.quests[id].claimed = true;
    progression().questsClaimedTotal += 1;
    progression().totalXP += quest.rewardXP;
    claimFx = { id, xp: quest.rewardXP };
    saveNow();
    checkAchievements();
    renderLevel();
    renderStats();
    updateXpUi();

    window.setTimeout(() => {
      if (claimFx && claimFx.id === id) {
        claimFx = null;
        if (isProfileActive()) renderLevel();
      }
    }, 1100);
  }

  function openQuestInfo(id) {
    activeQuestId = id;
    activeModal = 'quest';
    renderModal();
  }

  /* ── listening statistics ───────────────────────────────────────────── */

  function openListening() {
    activeModal = 'listening';
    renderModal();
  }

  function closeModal() {
    activeModal = null;
    activeQuestId = null;
    const host = $('#rp-modal-host');
    if (host) host.innerHTML = '';
  }

  function renderModal() {
    let host = $('#rp-modal-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'rp-modal-host';
      document.body.appendChild(host);
    }

    if (!activeModal) {
      host.innerHTML = '';
      return;
    }

    if (activeModal === 'listening') {
      renderListeningModal(host);
    } else if (activeModal === 'quest') {
      renderQuestModal(host);
    }
  }

  function renderListeningModal(host) {
    const p = progression();
    const dates = activeDates();
    const activeDays = dates.length;
    const avgSeconds = activeDays > 0 ? p.totalSecondsListened / activeDays : 0;
    const ranges = [
      { id: '7d', label: t('listening.range7') },
      { id: '30d', label: t('listening.range30') },
      { id: 'year', label: t('listening.rangeYear') },
      { id: 'all', label: t('listening.rangeAll') },
    ];

    host.innerHTML = `
      <div class="rp-modal" data-rp-action="close-modal">
        <div class="rp-modal-card" data-rp-stop>
          <div class="rp-modal-head">
            <div>
              <p class="rp-modal-title">${ICONS.headphones} ${escapeHtml(t('listening.title'))}</p>
              <p class="rp-modal-total">${escapeHtml(formatListeningTime(p.totalSecondsListened))}</p>
            </div>
            <button type="button" class="rp-modal-close" data-rp-action="close-modal" title="${escapeHtml(t('modal.close'))}">${ICONS.x}</button>
          </div>
          <div class="rp-mini-stats">
            <div class="rp-mini-stat"><span>${escapeHtml(t('stats.tracks'))}</span><strong>${formatNumber(p.totalTracksPlayed)}</strong></div>
            <div class="rp-mini-stat"><span>${escapeHtml(t('stats.activeDays'))}</span><strong>${formatNumber(activeDays)}</strong></div>
            <div class="rp-mini-stat"><span>${escapeHtml(t('listening.avg'))}</span><strong>${escapeHtml(formatListeningTime(avgSeconds))}</strong></div>
          </div>
          <div class="rp-ranges">
            ${ranges.map((range) => `<button type="button" class="rp-range-btn ${listeningRange === range.id ? 'is-active' : ''}" data-rp-range="${range.id}">${escapeHtml(range.label)}</button>`).join('')}
          </div>
          ${renderHeatmap(p.historyMap, RANGE_DAYS[listeningRange])}
          <div class="rp-legend">
            <span>${escapeHtml(t('listening.less'))}</span>
            <i class="rp-heat-cell"></i>
            <i class="rp-heat-cell l1"></i>
            <i class="rp-heat-cell l2"></i>
            <i class="rp-heat-cell l3"></i>
            <i class="rp-heat-cell l4"></i>
            <span>${escapeHtml(t('listening.more'))}</span>
          </div>
        </div>
      </div>
    `;
  }

  function heatClass(minutes) {
    if (!minutes || minutes <= 0) return '';
    if (minutes < 15) return 'l1';
    if (minutes < 45) return 'l2';
    if (minutes < 90) return 'l3';
    return 'l4';
  }

  function renderHeatmap(historyMap, days) {
    const cells = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const date = shiftDays(now, -i);
      const key = localDateKey(date);
      cells.push({ date: key, minutes: Number(historyMap[key] || 0), isToday: i === 0 });
    }

    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    return `
      <div class="rp-heatmap">
        ${weeks.map((week) => `
          <div class="rp-heatmap-week">
            ${week.map((cell) => {
              const duration = formatListeningTime(cell.minutes * 60);
              return `<span class="rp-heat-cell ${heatClass(cell.minutes)}${cell.isToday ? ' is-today' : ''}" title="${escapeHtml(cell.date)} · ${escapeHtml(duration)}" aria-label="${escapeHtml(cell.date)} · ${escapeHtml(duration)}"></span>`;
            }).join('')}
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderQuestModal(host) {
    const quest = QUESTS.find((item) => item.id === activeQuestId);
    if (!quest) {
      closeModal();
      return;
    }

    const progress = Math.min(getQuestProgress(quest.id), quest.target);
    const done = progress >= quest.target;
    const claimed = progression().daily.quests[quest.id].claimed;
    const countdown = formatCountdown(secondsUntilTomorrow());
    const status = claimed
      ? `${t('quest.availableIn')} ${countdown}`
      : done
        ? t('quest.ready')
        : t('quest.inProgress');

    host.innerHTML = `
      <div class="rp-modal" data-rp-action="close-modal">
        <div class="rp-modal-card" data-rp-stop>
          <div class="rp-modal-head">
            <div>
              <p class="rp-modal-title">${escapeHtml(t('quests.title'))}</p>
              <p class="rp-modal-total" style="font-size:calc(20px * var(--font-scale, 1));">${escapeHtml(t(quest.titleKey))}</p>
            </div>
            <button type="button" class="rp-modal-close" data-rp-action="close-modal" title="${escapeHtml(t('modal.close'))}">${ICONS.x}</button>
          </div>
          <p class="rp-quest-modal-desc">${escapeHtml(t(`quest.desc.${quest.id}`))}</p>
          <div class="rp-quest-modal-row">
            <span class="rp-quest-modal-reward">${ICONS.gift} +${quest.rewardXP} XP</span>
            <span class="rp-quest-modal-status">${escapeHtml(claimed ? `${t('quest.availableIn')} ${countdown}` : `${progress} / ${quest.target}`)}</span>
          </div>
          <div class="rp-quest-bar" style="margin-top:14px;background:rgba(255,255,255,.1);height:6px;">
            <div class="rp-quest-fill" style="width:${Math.round((progress / quest.target) * 100)}%"></div>
          </div>
          <p class="rp-quest-modal-status" style="margin-top:8px;text-align:center;">${escapeHtml(status)}</p>
        </div>
      </div>
    `;
  }

  /* ── editing ────────────────────────────────────────────────────────── */

  function openEdit() {
    readProfile();
    editDraft = {
      nick: profile.nick || '',
      handle: profile.handle || normalizeHandle(profile.nick),
      status: profile.status || '',
      bio: profile.bio || '',
      avatar: profile.avatar || '',
      banner: profile.banner || '',
      bannerFx: profile.bannerFx || '',
    };
    editError = '';
    editing = true;
    renderHero();
    const input = $('[data-rp-field="nick"]');
    if (input) input.focus();
  }

  function cancelEdit() {
    editing = false;
    editDraft = null;
    editError = '';
    renderHero();
  }

  async function pickImage(kind) {
    if (!editDraft) return;
    if (!window.electronAPI || typeof window.electronAPI.pickMedia !== 'function') {
      editError = t('edit.pickUnavailable');
      renderHero();
      return;
    }

    try {
      const url = await window.electronAPI.pickMedia();
      if (!url) return;
      if (kind === 'avatar') editDraft.avatar = url;
      if (kind === 'banner') editDraft.banner = url;
      editError = '';
      renderHero();
    } catch (_) {
      editError = t('edit.pickUnavailable');
      renderHero();
    }
  }

  function saveEdit() {
    if (!editDraft) return;
    const nick = String(editDraft.nick || '').trim();
    if (!nick) {
      editError = t('edit.nickRequired');
      renderHero();
      return;
    }

    const handle = normalizeHandle(editDraft.handle || nick) || normalizeHandle(nick);
    const patch = {
      nick,
      handle,
      status: String(editDraft.status || '').trim(),
      bio: String(editDraft.bio || '').trim(),
      avatar: String(editDraft.avatar || ''),
      banner: String(editDraft.banner || ''),
      bannerFx: String(editDraft.bannerFx || ''),
    };

    if (bridge) profile = bridge.saveUserProfile(patch);
    editing = false;
    editDraft = null;
    editError = '';
    lastProfileSignature = profileSignature();
    readProfile();
    renderAll();
    refreshNavAvatar();
    checkAchievements();
    saveNow();
  }

  /* ── navigation / avatar ────────────────────────────────────────────── */

  function isProfileActive() {
    const view = document.getElementById('view-profile');
    return Boolean(view && view.classList.contains('active'));
  }

  function navFallbackSrc(initial) {
    let primary = '#a855f7';
    try {
      const fromTheme = getComputedStyle(document.documentElement)
        .getPropertyValue('--md-sys-color-primary')
        .trim();
      if (fromTheme) primary = fromTheme;
    } catch (_) {}

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${primary}"/><stop offset="1" stop-color="#05040a"/></linearGradient></defs><rect width="60" height="60" fill="url(#g)"/><text x="30" y="40" text-anchor="middle" font-family="Arial, sans-serif" font-size="28" font-weight="700" fill="#ffffff">${initial}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function refreshNavAvatar() {
    const node = document.getElementById('nav-profile-avatar');
    if (!node) return;
    const nick = String(profile.nick || 'User');
    const avatar = String(profile.avatar || '');
    const initial = initialOf(nick);

    if (node.tagName === 'IMG') {
      node.alt = nick;
      node.onerror = () => { node.src = navFallbackSrc(initial); };
      node.src = avatar || navFallbackSrc(initial);
    } else if (avatar) {
      node.innerHTML = `<img src="${escapeHtml(avatar)}" alt="" draggable="false" onerror="this.style.display='none'">`;
    } else {
      node.textContent = initial;
    }

    const label = document.getElementById('nav-profile-label');
    if (label) label.textContent = t('nav.profile');
    const button = document.getElementById('nav-profile');
    if (button) button.title = t('nav.profile');
  }

  function onShow() {
    pendingShow = false;
    if (!initialized) return;

    const main = document.getElementById('main-content');
    if (main) main.scrollTop = 0;

    readProfile();
    lastProfileSignature = profileSignature();
    renderAll();
    if (bridge) {
      lastSnapshot = bridge.getPlaybackSnapshot();
      renderNow();
    }
  }

  function handleRootClick(event) {
    const actionNode = event.target.closest('[data-rp-action]');
    if (!actionNode) return;
    const action = actionNode.getAttribute('data-rp-action');

    if (action === 'edit') {
      openEdit();
      return;
    }

    if (action === 'cancel-edit') {
      cancelEdit();
      return;
    }

    if (action === 'save-edit') {
      saveEdit();
      return;
    }

    if (action === 'pick-avatar') {
      void pickImage('avatar');
      return;
    }

    if (action === 'pick-banner') {
      void pickImage('banner');
      return;
    }

    if (action === 'clear-banner' && editDraft) {
      editDraft.banner = '';
      renderHero();
      return;
    }

    if (action === 'set-banner-fx' && editDraft) {
      editDraft.bannerFx = actionNode.getAttribute('data-fx') || '';
      renderHero();
      return;
    }

    if (action === 'toggle-play') {
      if (bridge) bridge.togglePlayback();
      return;
    }

    if (action === 'prev') {
      if (bridge) bridge.playPrev();
      return;
    }

    if (action === 'next') {
      if (bridge) bridge.playNext();
      return;
    }

    if (action === 'toggle-shuffle') {
      if (bridge) bridge.toggleShuffle();
      window.setTimeout(() => { if (isProfileActive()) renderNow(); }, 60);
      return;
    }

    if (action === 'toggle-repeat') {
      if (bridge) bridge.toggleRepeat();
      window.setTimeout(() => { if (isProfileActive()) renderNow(); }, 60);
      return;
    }

    if (action === 'play-upcoming') {
      const offset = Number(actionNode.getAttribute('data-offset'));
      if (bridge && typeof bridge.playUpcoming === 'function') bridge.playUpcoming(offset);
      return;
    }

    if (action === 'claim-quest') {
      claimQuest(actionNode.getAttribute('data-quest'));
      return;
    }

    if (action === 'quest-info') {
      openQuestInfo(actionNode.getAttribute('data-quest'));
      return;
    }

    if (action === 'open-listening') {
      openListening();
      return;
    }

    if (action === 'toggle-achievements') {
      achievementsExpanded = !achievementsExpanded;
      renderAchievements();
      return;
    }

    if (action === 'close-modal') {
      closeModal();
    }
  }

  function handleRootInput(event) {
    const target = event.target;

    if (target.matches('[data-rp-field]') && editDraft) {
      editDraft[target.getAttribute('data-rp-field')] = target.value;
      return;
    }

    if (target.id === 'rp-now-seek') {
      isSeekingTrack = true;
      const value = Number(target.value);
      const max = Number(target.max) || 0;
      const percent = max > 0 ? clamp((value / max) * 100, 0, 100) : 0;
      target.style.setProperty('--rp-progress', `${percent}%`);
      const fill = $('#rp-now-fill');
      if (fill) fill.style.width = `${percent}%`;
      const current = $('#rp-now-cur');
      if (current) current.textContent = formatClock(value);
      return;
    }
  }

  function handleRootChange(event) {
    const target = event.target;
    if (target.id === 'rp-now-seek') {
      if (bridge) bridge.seek(Number(target.value));
      isSeekingTrack = false;
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      if (activeModal) {
        closeModal();
        return;
      }
      if (editing) cancelEdit();
    }
  }

  function handleModalClick(event) {
    const rangeButton = event.target.closest('[data-rp-range]');
    if (rangeButton) {
      listeningRange = rangeButton.getAttribute('data-rp-range') || '30d';
      renderModal();
      return;
    }

    // Кнопка закрытия находится ВНУТРИ карточки с data-rp-stop,
    // поэтому её нужно проверять раньше, чем «клик внутри окна».
    if (event.target.closest('[data-rp-action="close-modal"]')) {
      closeModal();
      return;
    }

    if (event.target.closest('[data-rp-stop]')) return;
  }

  /* ── boot ───────────────────────────────────────────────────────────── */

  function boot() {
    store = loadStore();
    let attempts = 0;

    const waitForBridge = window.setInterval(() => {
      attempts += 1;
      if (window.RiffProfileBridge) {
        window.clearInterval(waitForBridge);
        start();
        return;
      }
      if (attempts > 160) {
        window.clearInterval(waitForBridge);
        console.warn('[profile] RiffProfileBridge not found; profile page is unavailable.');
      }
    }, 250);
  }

  function start() {
    if (initialized) return;
    initialized = true;
    bridge = window.RiffProfileBridge;

    readProfile();
    lastProfileSignature = profileSignature();
    lastLanguage = currentLanguage();
    lastBgEnabled = profileBackgroundEnabled();

    buildShell();
    const root = $('#profile-root');
    if (root) {
      root.addEventListener('click', handleRootClick);
      root.addEventListener('input', handleRootInput);
      root.addEventListener('change', handleRootChange);
      root.addEventListener('pointermove', updateBackgroundParallax);
      root.addEventListener('pointerleave', resetBackgroundParallax);
    }

    const modalHost = document.createElement('div');
    modalHost.id = 'rp-modal-host';
    modalHost.addEventListener('click', handleModalClick);
    document.body.appendChild(modalHost);

    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('beforeunload', saveNow);
    window.addEventListener('riff:profile-bg-changed', applyProfileBackground);
    document.addEventListener('pointermove', updateGlobalBackgroundParallax, { passive: true });
    document.addEventListener('pointerleave', resetBackgroundParallax, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveNow();
    });

    const volumeSlider = document.getElementById('volume-slider');
    if (volumeSlider) {
      volumeSlider.addEventListener('input', syncVolumeSlider);
      syncVolumeSlider();
    }

    const snapshot = bridge.getLibrarySnapshot ? bridge.getLibrarySnapshot() : null;
    if (snapshot) {
      library = {
        favoriteIds: snapshot.favoriteIds || [],
        playlists: snapshot.playlists || [],
        counts: snapshot.counts || { favorites: 0, playlists: 0 },
      };
    }

    // First run: establish a baseline without a burst of XP or notifications.
    const p = progression();
    if (freshInstall) {
      p.lastFavoriteIds = (library.favoriteIds || []).slice();
      p.lastMaxPlaylistTracks = maxPlaylistTracks();
      checkAchievements(true);
      saveNow();
    } else {
      checkAchievements(true);
    }

    refreshNavAvatar();
    renderAll();

    if (pendingShow || isProfileActive()) {
      onShow();
    }

    window.setInterval(tick, 1000);
    window.setInterval(pollLibrary, 2000);
    window.setInterval(() => {
      if (!isProfileActive()) return;
      checkAchievements();
      updateAchievementProgress();
    }, 8000);

    window.RiffProfile = {
      onShow,
      onTrackEnded,
      refreshNavAvatar,
      open: () => { if (bridge) bridge.setView('profile'); },
      /*
       * Точки входа для будущей синхронизации с Google Drive: забираем
       * снимок профиля/прогресса и применяем его после восстановления.
       */
      getCloudPayload: () => ({
        version: PROFILE_VERSION,
        profile: bridge ? bridge.getUserProfile() : profile,
        progression: store ? JSON.parse(JSON.stringify(store.progression)) : null,
      }),
      applyCloudPayload: (payload) => {
        if (!payload || typeof payload !== 'object') return false;
        if (!store) return false;

        if (payload.progression && typeof payload.progression === 'object') {
          store.progression = mergeProgression(payload.progression);
          freshInstall = false;
        }

        if (payload.profile && bridge) {
          profile = bridge.saveUserProfile(payload.profile);
        }

        saveNow();
        readProfile();
        lastProfileSignature = profileSignature();
        renderAll();
        checkAchievements();
        return true;
      },
      refresh: () => {
        readProfile();
        lastProfileSignature = profileSignature();
        renderAll();
      },
    };
  }

  // A stub so switchView can safely call onShow before the bridge is ready.
  window.RiffProfile = window.RiffProfile || {
    onShow: () => { pendingShow = true; },
    onTrackEnded: () => {},
    refreshNavAvatar: () => {},
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
