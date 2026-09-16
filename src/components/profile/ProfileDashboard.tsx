import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  BadgeCheck,
  Headphones,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Repeat,
  Shield,
  Shuffle,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";

import { useAppStore } from "../../store/useAppStore";
import { usePlayerStore } from "../../store/usePlayerStore";
import { useProgressionStore, collectActiveDays } from "../../store/useProgressionStore";
import { useLibraryStore } from "../../store/useLibraryStore";
import { useT } from "../../i18n/useT";
import { TrackCover } from "../tracks/TrackCover";
import type { PlaylistTrack } from "../../types/playlist";
import {
  getAchievementProgress,
  getMetricValue,
} from "../../lib/achievements";
import type { AchievementMetrics } from "../../lib/achievements";
import {
  useAchievementsStore,
  useAchievementsSummary,
  useAchievementsWithState,
} from "../../store/useAchievementsStore";
import { AchievementTile } from "./AchievementTile";
import { formatListeningTime } from "../../lib/format";
import {
  computeActiveDaysDelta,
  computeDailyDelta,
  countActiveDaysThisWeek,
} from "../../lib/statPeriods";
import type { StatDelta } from "../../lib/statPeriods";
import { getRankByXp, getRankProgress } from "../../lib/ranks";
import { getFrequencyLevels, resumeAnalyser } from "../../audio/analyser";
import { isSupabaseConfigured } from "../../lib/supabase";
import { uploadProfileImage, UploadError } from "../../lib/supabase/storage";
import { ProfileError } from "../../lib/supabase/profile";
import { toast } from "../ui/Toast";
import { ListeningStatsModal } from "./ListeningStatsModal";
import { DailyQuests } from "./DailyQuests";
import { RankIcon } from "./RankIcon";

type ProfileDashboardProps = {
  isOpen: boolean;
  onClose: () => void;
  favoriteCount: number;
};

export function ProfileDashboard({
  isOpen,
  onClose,
  favoriteCount,
}: ProfileDashboardProps) {
  const { t } = useT();
  const profile = useAppStore((s) => s.profile);
  const updateProfile = useAppStore((s) => s.updateProfile);

  const [isStatsOpen, setIsStatsOpen] = useState(false);

  // Esc — закрыть дашборд (если не открыта модалка статистики).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isStatsOpen) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, isStatsOpen]);

  if (typeof document === "undefined") return null;

  const nick = profile?.nick ?? "sqwer";
  const handle = profile?.handle ?? "@sqwer";
  const avatarUrl = profile?.avatarUrl ?? null;
  const coverUrl = profile?.coverUrl ?? null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[95] overflow-y-auto bg-[#05040a]/95 backdrop-blur-2xl noctra-scrollbar"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={onClose}
        >
          <motion.div
            className="mx-auto w-full max-w-[1100px] px-5 py-8"
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.99 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Верхняя панель */}
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-[0.32em] text-purple-200/40">
                Noctra / {t("win.profile.title")}
              </p>
              <button
                onClick={onClose}
                className="rounded-full border border-white/10 bg-black/50 p-2.5 text-purple-100/70 transition hover:bg-white/10 hover:text-white"
                title={t("dash.close")}
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <ProfileHero
                nick={nick}
                handle={handle}
                avatarUrl={avatarUrl}
                coverUrl={coverUrl}
                status={profile?.status ?? ""}
                bio={profile?.bio ?? ""}
                onSave={(next) => {
                  /*
                   * Тег уникален в базе: если его занял другой человек,
                   * репозиторий бросает ProfileError с кодом. Показываем
                   * понятный текст вместо «duplicate key violates constraint».
                   */
                  void updateProfile(next).catch((error: unknown) => {
                    const code =
                      error instanceof ProfileError ? error.code : null;
                    toast(
                      code === "tag_taken"
                        ? t("profile.error.tagTaken")
                        : t("profile.error.saveFailed"),
                    );
                  });
                }}
              />

              <NowPlayingWidget />

              <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
                <LevelCrest />
                <StatsGrid
                  favoriteCount={favoriteCount}
                  onOpenListening={() => setIsStatsOpen(true)}
                />
              </div>

              <AchievementsGrid />
            </div>
          </motion.div>

          <ListeningStatsModal
            isOpen={isStatsOpen}
            onClose={() => setIsStatsOpen(false)}
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}


/* ── 1. Hero ────────────────────────────────────────────────────────── */

function ProfileHero({
  nick,
  handle,
  avatarUrl,
  coverUrl,
  status,
  bio,
  onSave,
}: {
  nick: string;
  handle: string;
  avatarUrl: string | null;
  coverUrl: string | null;
  status: string;
  bio: string;
  onSave: (next: {
    nick: string;
    handle: string;
    status: string;
    bio: string;
    avatarUrl: string | null;
    coverUrl: string | null;
  }) => void;
}) {
  const { t } = useT();
  const [isEditing, setIsEditing] = useState(false);

  const totalXP = useProgressionStore((s) => s.totalXP);
  const rankProgress = getRankProgress(totalXP);

  if (isEditing) {
    return (
      <ProfileHeroEdit
        initial={{ nick, handle, status, bio, avatarUrl, coverUrl }}
        onCancel={() => setIsEditing(false)}
        onSave={(next) => {
          onSave(next);
          setIsEditing(false);
        }}
      />
    );
  }

  return (
    <div className="relative flex min-h-[300px] w-full flex-col justify-between overflow-hidden rounded-2xl border border-white/10 p-6">
      {/* 1. Фоновый баннер на весь блок */}
      <div className="absolute inset-0 z-0">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className="h-full w-full object-cover object-center"
          />
        ) : (
          <div className="h-full w-full bg-[radial-gradient(circle_at_top,var(--accent-glow),rgba(20,14,32,0.95))]" />
        )}
        {/* Затемнение, чтобы текст и аватар легко читались */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-black/20" />
      </div>

      {/* 2. Верхний слой: кнопки */}
      <div className="relative z-10 flex justify-end gap-2">
        <button
          onClick={() => setIsEditing(true)}
          className="flex items-center gap-2 rounded-full border border-white/15 bg-black/50 px-3.5 py-1.5 text-xs font-semibold text-purple-50 backdrop-blur transition hover:bg-white/10"
        >
          <Pencil size={13} />
          {t("profile.edit")}
        </button>
        <button
          className="inline-flex aspect-square items-center justify-center rounded-full border border-white/15 bg-black/50 p-2 text-purple-100/70 backdrop-blur transition hover:bg-white/10 hover:text-white"
          title="•••"
        >
          <MoreHorizontal size={15} className="m-0 block" />
        </button>
      </div>

      {/* 3. Нижний слой: аватар, ник, ранг и XP */}
      <div className="relative z-10 mt-auto">
        <div className="flex items-end gap-5">
          <div className="relative inline-block h-28 w-28 shrink-0">
            <div
              className="absolute inset-0 rounded-full border border-[color:var(--accent-border)]"
              style={{ boxShadow: "0 0 32px var(--accent-glow)" }}
            />
            <div className="absolute inset-[5px] rounded-full border border-white/10" />
            <div className="absolute inset-[9px] overflow-hidden rounded-full border-[3px] border-black/60 bg-black/80">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-4xl font-bold text-purple-200">
                  {nick[0]?.toUpperCase()}
                </span>
              )}
            </div>

            {/* Бейдж ранга: по нижнему краю аватара, без фона */}
            <div className="pointer-events-none absolute bottom-0 left-1/2 z-20 -translate-x-1/2 translate-y-1/3">
              <RankIcon icon={rankProgress.rank.icon} size={40} glow={12} />
            </div>
          </div>

          <div className="min-w-0 pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-3xl font-extrabold text-white">
                {nick}
              </h2>
              <span className="inline-flex aspect-square h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-500/30 p-0 leading-none text-purple-100">
                <BadgeCheck size={13} className="m-0 block" />
              </span>
            </div>
            <p className="text-sm text-purple-100/55">{handle}</p>
            {bio && (
              <p className="mt-1 line-clamp-2 text-sm text-purple-100/70">
                {bio}
              </p>
            )}
            {status && (
              <p className="mt-1 text-sm font-semibold text-purple-100/80">
                {status}
              </p>
            )}
          </div>
        </div>

        {/* Текущий ранг + прогресс опыта */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-purple-300/25 bg-black/40 px-3 py-1.5 text-xs text-purple-100 backdrop-blur">
            <Shield size={13} className="m-0 block text-purple-200" />
            {t(rankProgress.rank.labelKey)}
          </span>

          <div className="flex min-w-[160px] flex-1 items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-purple-400"
                style={{
                  width: `${rankProgress.percent}%`,
                  boxShadow: "0 0 10px var(--accent-glow)",
                }}
              />
            </div>
            <span className="shrink-0 text-[11px] text-purple-100/60">
              {rankProgress.nextRank
                ? `${rankProgress.xpIntoRank.toLocaleString()} / ${rankProgress.xpForRank.toLocaleString()} XP`
                : `${rankProgress.xp.toLocaleString()} XP`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileHeroEdit({
  initial,
  onSave,
  onCancel,
}: {
  initial: {
    nick: string;
    handle: string;
    status: string;
    bio: string;
    avatarUrl: string | null;
    coverUrl: string | null;
  };
  onSave: (next: {
    nick: string;
    handle: string;
    status: string;
    bio: string;
    avatarUrl: string | null;
    coverUrl: string | null;
  }) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const [nick, setNick] = useState(initial.nick);
  const [handle, setHandle] = useState(initial.handle);
  const [status, setStatus] = useState(initial.status);
  const [bio, setBio] = useState(initial.bio);
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl);
  const [coverUrl, setCoverUrl] = useState(initial.coverUrl);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const field =
    "w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none placeholder:text-purple-100/30 focus:border-purple-300/40";

  /**
   * Выбор картинки.
   *
   * В облачном режиме файл уходит в Supabase Storage, а в поле профиля
   * попадает публичный URL. Локально остаётся dataURL — сеть не нужна.
   */
  async function pick(
    file: File | undefined,
    setter: (value: string) => void,
    bucket: "avatars" | "banners",
  ) {
    if (!file) return;

    setUploadError(null);

    if (!isSupabaseConfigured) {
      try {
        setter(await readFileAsDataUrl(file));
      } catch {
        /* игнор */
      }
      return;
    }

    setIsUploading(true);

    try {
      setter(await uploadProfileImage(file, bucket));
    } catch (error) {
      const code = error instanceof UploadError ? error.code : "upload_failed";
      setUploadError(t(`profile.upload.${code}`));
    } finally {
      setIsUploading(false);
    }
  }

  function commit() {
    const trimmedNick = nick.trim();
    if (!trimmedNick) return;

    onSave({
      nick: trimmedNick,
      handle: handle.trim().startsWith("@")
        ? handle.trim()
        : `@${handle.trim().replace(/^@*/g, "")}`,
      status: status.trim(),
      bio: bio.trim(),
      avatarUrl,
      coverUrl,
    });
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-black/40 p-5">
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-purple-100/45">
        {t("profile.editing.title")}
      </p>

      {/* Баннер + аватар превью */}
      <div className="relative mb-14">
        <div className="relative h-36 overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(circle_at_top,var(--accent-glow),rgba(30,20,45,0.9))]">
          {coverUrl && (
            <img src={coverUrl} alt="" className="h-full w-full object-cover" />
          )}
          <label className="absolute right-2 top-2 flex cursor-pointer items-center gap-1 rounded-full border border-white/15 bg-black/60 px-2.5 py-1 text-[11px] text-white backdrop-blur transition hover:bg-black/80">
            {t("profile.editing.cover")}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void pick(e.target.files?.[0], setCoverUrl, "banners")}
            />
          </label>
        </div>

        <label className="absolute -bottom-12 left-5 flex h-20 w-20 cursor-pointer items-center justify-center overflow-hidden rounded-full border-[3px] border-[#0b0a12] bg-black/80 text-xl font-bold">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            nick[0]?.toUpperCase() ?? "@"
          )}
          <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-[10px] font-normal text-white opacity-0 transition hover:opacity-100">
            {t("profile.editing.avatar")}
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
              onChange={(e) => void pick(e.target.files?.[0], setAvatarUrl, "avatars")}
          />
        </label>
      </div>

      {(isUploading || uploadError) && (
        <p
          className={`mb-4 rounded-2xl border px-4 py-2.5 text-xs ${
            uploadError
              ? "border-red-300/25 bg-red-500/10 text-red-100/80"
              : "border-white/10 bg-white/[0.04] text-purple-100/60"
          }`}
        >
          {uploadError ?? t("profile.upload.uploading")}
        </p>
      )}

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-[11px] uppercase tracking-[0.16em] text-purple-100/40">
              {t("profile.editing.nick")}
            </label>
            <input value={nick} onChange={(e) => setNick(e.target.value)} className={field} />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] uppercase tracking-[0.16em] text-purple-100/40">
              {t("profile.editing.handle")}
            </label>
            <input value={handle} onChange={(e) => setHandle(e.target.value)} className={field} />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] uppercase tracking-[0.16em] text-purple-100/40">
            {t("profile.editing.status")}
          </label>
          <input value={status} onChange={(e) => setStatus(e.target.value)} className={field} />
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] uppercase tracking-[0.16em] text-purple-100/40">
            {t("profile.editing.bio")}
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className={`${field} h-24 resize-none`}
          />
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={commit}
          disabled={!nick.trim()}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-purple-300/25 bg-purple-500/20 px-4 py-3 text-sm font-semibold text-white transition hover:bg-purple-500/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Pencil size={14} />
          {t("profile.save")}
        </button>
        <button
          onClick={onCancel}
          className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-purple-100/60 transition hover:bg-white/[0.08] hover:text-white"
        >
          {t("profile.cancel.edit")}
        </button>
      </div>
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("read failed"));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}


/* ── 2. Now Playing ─────────────────────────────────────────────────── */

function NowPlayingWidget() {
  const { t } = useT();
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const playQueue = usePlayerStore((s) => s.playQueue);
  const currentTrackIndex = usePlayerStore((s) => s.currentTrackIndex);
  const userQueue = usePlayerStore((s) => s.trackQueue);
  const playMode = usePlayerStore((s) => s.playMode);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playNext = usePlayerStore((s) => s.playNext);
  const playPrevious = usePlayerStore((s) => s.playPrevious);
  const cyclePlayMode = usePlayerStore((s) => s.cyclePlayMode);
  const selectQueueTrack = usePlayerStore((s) => s.selectQueueTrack);

  const storeTime = usePlayerStore((s) => s.currentTime);
  const storeDuration = usePlayerStore((s) => s.duration);
  const requestToggle = usePlayerStore((s) => s.requestToggle);
  const requestSeek = usePlayerStore((s) => s.requestSeek);

  // «Далее в очереди»: сначала пользовательская очередь, иначе — треки,
  // следующие за текущим индексом в плейлисте (с зацикливанием при repeat-all).
  const upcoming = (() => {
    if (userQueue.length > 0) {
      return userQueue.slice(0, 3);
    }

    const next = playQueue.slice(currentTrackIndex + 1, currentTrackIndex + 4);

    if (next.length < 3 && playMode === "repeat-all" && playQueue.length > 0) {
      const remaining = 3 - next.length;
      return [...next, ...playQueue.slice(0, remaining)];
    }

    return next;
  })();

  const durationSec = storeDuration || 0;
  const progress = durationSec > 0 ? Math.min((storeTime / durationSec) * 100, 100) : 0;

  function handleSeekInput(e: React.ChangeEvent<HTMLInputElement>) {
    requestSeek(Number(e.target.value));
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-neutral-950/60 p-5 backdrop-blur-md">
      <div className="mb-4 flex items-center justify-between">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-purple-200">
          <Headphones size={15} />
          {t("dash.nowPlaying")}
        </p>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] uppercase tracking-wider text-purple-100/50">
          {currentTrack?.source ?? "Telegram"}
        </span>
      </div>

      {!currentTrack ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Headphones size={26} className="text-purple-100/30" />
          <p className="text-sm font-semibold text-white/80">{t("dash.noTrack")}</p>
          <p className="text-xs text-purple-100/45">{t("dash.pickTrack")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1px_1fr]">
          {/* Контроллер */}
          <div className="flex flex-col">
            <div className="flex items-center gap-4">
              <div
                className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-[color:var(--accent-border)]"
                style={{ boxShadow: "0 0 26px var(--accent-glow)" }}
              >
                <TrackCover track={currentTrack} size="h-20 w-20" />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-lg font-bold text-white">
                    {currentTrack.title}
                  </p>
                  <span className="rounded border border-white/20 px-1.5 py-0.5 text-[10px] font-bold text-purple-100/70">
                    E
                  </span>
                </div>
                <p className="truncate text-sm text-purple-100/50">
                  {currentTrack.artist}
                </p>
              </div>
            </div>

            {/* Кнопки управления */}
            <div className="mt-4 flex items-center justify-center gap-4">
              <button
                onClick={cyclePlayMode}
                className="text-purple-100/50 transition hover:text-white"
                title={t("player.mode.shuffle")}
              >
                <Shuffle size={17} />
              </button>
              <button
                onClick={playPrevious}
                className="text-purple-100/60 transition hover:text-white"
              >
                <SkipBack size={18} />
              </button>
              <button
                onClick={requestToggle}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/30 text-white shadow-lg transition hover:bg-purple-500/45"
                style={{ boxShadow: "0 0 24px var(--accent-glow)" }}
                title={t("player.playpause")}
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              </button>
              <button
                onClick={playNext}
                className="text-purple-100/60 transition hover:text-white"
              >
                <SkipForward size={18} />
              </button>
              <button
                onClick={cyclePlayMode}
                className="text-purple-100/50 transition hover:text-white"
                title={t("player.mode.repeat-all")}
              >
                <Repeat size={17} />
              </button>
            </div>

            {/* Waveform */}
            <Waveform active={isPlaying} />

            {/* Таймлайн (реальный, управляет основным плеером) */}
            <div className="mt-2 flex items-center gap-3 text-[11px] text-purple-100/40">
              <span>{formatClock(storeTime)}</span>
              <input
                type="range"
                min={0}
                max={durationSec || 0}
                step={0.1}
                value={Math.min(storeTime, durationSec || 0)}
                onChange={handleSeekInput}
                disabled={durationSec <= 0}
                className="noctra-range flex-1 cursor-pointer disabled:cursor-not-allowed"
                style={{ "--range-progress": `${progress}%` } as React.CSSProperties}
              />
              <span>{durationSec > 0 ? formatClock(durationSec) : currentTrack.duration}</span>
            </div>
          </div>

          {/* Разделитель */}
          <div className="hidden bg-white/5 lg:block" />

          {/* Мини-очередь */}
          <div className="min-w-0">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-purple-100/40">
              {t("dash.miniQueue")}
            </p>

            {upcoming.length === 0 ? (
              <p className="text-xs text-purple-100/35">{t("dash.queueEmpty")}</p>
            ) : (
              <div className="space-y-2">
                {upcoming.map((track) => (
                  <MiniQueueRow
                    key={track.id}
                    track={track}
                    onPlay={() => selectQueueTrack(track)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniQueueRow({
  track,
  onPlay,
}: {
  track: PlaylistTrack;
  onPlay: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-2 transition hover:bg-white/[0.06]">
      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg">
        <TrackCover track={track} size="h-9 w-9" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-white/90">
          {track.title}
        </p>
        <p className="truncate text-[11px] text-purple-100/40">{track.artist}</p>
      </div>
      <button
        onClick={onPlay}
        className="rounded-full p-1.5 text-purple-100/55 transition hover:bg-white/10 hover:text-white"
      >
        <Play size={13} />
      </button>
    </div>
  );
}

function Waveform({ active }: { active: boolean }) {
  const bars = 48;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef(active);
  const levelsRef = useRef<number[]>(Array.from({ length: bars }, () => 0));
  const phaseRef = useRef(0);

  // Держим актуальное значение active без пересоздания rAF-цикла.
  useEffect(() => {
    activeRef.current = active;
    if (active) void resumeAnalyser();
  }, [active]);

  // Единый цикл на requestAnimationFrame. Обновляем высоты напрямую через DOM
  // (без setState каждый кадр) — это даёт плавные 60fps и нет «тормозов».
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const nodes = Array.from(
      container.querySelectorAll<HTMLElement>("[data-bar]"),
    );
    let raf = 0;

    const tick = () => {
      const isActive = activeRef.current;
      const data = isActive ? getFrequencyLevels(bars) : null;
      const target = levelsRef.current;

      phaseRef.current += 0.12;

      for (let i = 0; i < bars; i++) {
        let desired: number;

        if (data) {
          desired = data[i];
        } else if (isActive) {
          // Анализатор недоступен, но трек играет — живая имитация.
          desired =
            0.2 +
            0.4 *
              (0.5 +
                0.5 *
                  Math.sin(phaseRef.current + i * 0.35) *
                  Math.sin(phaseRef.current * 0.5 + i * 0.1));
        } else {
          desired = 0.06;
        }

        // Плавная интерполяция к целевому значению.
        target[i] += (desired - target[i]) * (data ? 0.45 : 0.18);

        const node = nodes[i];
        if (node) {
          node.style.height = `${Math.max(6, Math.min(100, target[i] * 100))}%`;
          node.style.opacity = String(0.35 + Math.min(0.65, target[i]));
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={containerRef}
      className="mt-4 flex h-10 items-end justify-center gap-[2px]"
    >
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          data-bar
          className="w-[3px] rounded-full bg-purple-400"
          style={{ height: "6%", boxShadow: "0 0 8px var(--accent-glow)" }}
        />
      ))}
    </div>
  );
}

function formatClock(seconds: number): string {
  if (!seconds || Number.isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ── 3A. Level & Crest ──────────────────────────────────────────────── */

function LevelCrest() {
  const { t } = useT();

  const totalXP = useProgressionStore((s) => s.totalXP);
  const progress = getRankProgress(totalXP);

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/5 bg-neutral-950/60 p-5 backdrop-blur-md">
      {/* Кибернетические уголки */}
      <Corners />

      <div className="flex items-center gap-5">
        {/* Эмблема ранга: только PNG со свечением, без фона и рамок */}
        <div className="flex h-28 w-28 shrink-0 items-center justify-center">
          <RankIcon
            icon={progress.rank.icon}
            size={112}
            glow={18}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.24em] text-purple-100/45">
            {t("dash.level")} {progress.rank.tier}
          </p>
          <p className="text-lg font-bold leading-tight text-white sm:text-xl">
            {t(progress.rank.labelKey)}
          </p>
          <p className="mt-1 text-sm font-semibold text-purple-200">
            {totalXP.toLocaleString()} XP
          </p>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-purple-100/45">
          <span className="min-w-0">
            {progress.nextRank
              ? `${t("dash.nextRank")}: ${t(progress.nextRank.labelKey)}`
              : t("dash.maxRank")}
          </span>
          {progress.nextRank && (
            <span className="shrink-0">
              +{progress.xpToNext.toLocaleString()} XP
            </span>
          )}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-purple-400"
            style={{
              width: `${progress.percent}%`,
              boxShadow: "0 0 14px var(--accent-glow)",
            }}
          />
        </div>
        {progress.nextRank && (
          <div className="mt-1.5 text-right text-[10px] text-purple-100/35">
            {progress.xpIntoRank.toLocaleString()} /{" "}
            {progress.xpForRank.toLocaleString()} XP
          </div>
        )}
      </div>

      {/* Ежедневные задания */}
      <DailyQuests />
    </div>
  );
}

function Corners() {
  const base =
    "pointer-events-none absolute h-4 w-4 border-purple-300/40";
  return (
    <>
      <span className={`${base} left-2 top-2 border-l border-t`} />
      <span className={`${base} right-2 top-2 border-r border-t`} />
      <span className={`${base} bottom-2 left-2 border-b border-l`} />
      <span className={`${base} bottom-2 right-2 border-b border-r`} />
    </>
  );
}

/* ── 3B. Overall stats ──────────────────────────────────────────────── */

/** Дней в неделе — знаменатель для плитки «Дней активности». */
const ACTIVE_DAYS_PER_WEEK = 7;

function StatsGrid({
  favoriteCount,
  onOpenListening,
}: {
  favoriteCount: number;
  onOpenListening: () => void;
}) {
  const { t } = useT();
  const totalSecondsListened = useProgressionStore((s) => s.totalSecondsListened);
  const totalTracksPlayed = useProgressionStore((s) => s.totalTracksPlayed);
  const historyMap = useProgressionStore((s) => s.historyMap);
  const tracksByDay = useProgressionStore((s) => s.tracksByDay);
  const favoritesByDay = useProgressionStore((s) => s.favoritesByDay);

  /*
   * Активные дни — объединение всех дневных историй.
   *
   * Одного времени прослушивания мало: человек мог в этот день только
   * добавлять треки в избранное. Такой день тоже активный, и считать его
   * нужно — иначе метрика занижалась бы.
   */
  const activeDates = collectActiveDays(historyMap, tracksByDay, favoritesByDay);
  const totalActiveDays = activeDates.length;

  /*
   * Период сравнения зависит от метрики.
   *
   * Время, треки и избранное — ежедневные действия, сравниваем сегодня
   * со вчера. Дни активности — про охват недели, поэтому сравниваем
   * текущую неделю с прошлой и показываем «3 / 7».
   */
  const listeningDelta = computeDailyDelta(historyMap);
  const tracksDelta = computeDailyDelta(tracksByDay);
  const favoritesDelta = computeDailyDelta(favoritesByDay);
  const activeDaysDelta = computeActiveDaysDelta(activeDates);
  const activeThisWeek = countActiveDaysThisWeek(activeDates);

  const stats: {
    icon: string;
    label: string;
    value: string;
    delta: StatDelta;
    /** Период сравнения — показывается подписью у бейджа. */
    period: string;
    onClick?: () => void;
  }[] = [
    {
      icon: "🎧",
      label: t("dash.listeningHours"),
      value: formatListeningTime(totalSecondsListened, t),
      delta: listeningDelta,
      period: t("dash.period.today"),
      onClick: onOpenListening,
    },
    {
      icon: "💿",
      label: t("dash.tracksPlayed"),
      value: totalTracksPlayed.toLocaleString(),
      delta: tracksDelta,
      period: t("dash.period.today"),
    },
    {
      icon: "❤️",
      label: t("dash.likedTracks"),
      value: favoriteCount.toLocaleString(),
      delta: favoritesDelta,
      period: t("dash.period.today"),
    },
    {
      icon: "📅",
      label: t("dash.activeDays"),
      // Показываем охват недели: «3 / 7» читается сразу, в отличие от «3».
      value: t("dash.activeDaysValue", {
        current: activeThisWeek,
        total: ACTIVE_DAYS_PER_WEEK,
      }),
      delta: activeDaysDelta,
      // В подсказке — всего дней за всё время: недельная цифра не даёт
      // представления о том, как давно человек пользуется приложением.
      period: t("dash.period.weekWithTotal", { total: totalActiveDays }),
    },
  ];

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/5 bg-neutral-950/60 p-5 backdrop-blur-md">
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-purple-100/45">
        {t("dash.overallStats")}
      </p>

      <div className="grid h-full grid-cols-2 gap-3">
        {stats.map((stat) => (
          <button
            key={stat.label}
            type="button"
            onClick={stat.onClick}
            className={`flex h-full flex-col justify-between rounded-xl border border-white/5 bg-white/[0.03] p-3.5 text-left transition ${
              stat.onClick
                ? "cursor-pointer hover:border-purple-300/30 hover:bg-white/[0.06]"
                : "cursor-default"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-lg">{stat.icon}</span>
              <DeltaBadge
                delta={stat.delta}
                label={t("dash.newBadge")}
                period={stat.period}
              />
            </div>
            <div>
              <p className="mt-2 text-xl font-bold text-white">{stat.value}</p>
              <p className="mt-0.5 text-[11px] text-purple-100/45">
                {stat.label}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function DeltaBadge({
  delta,
  label,
  period,
}: {
  delta: StatDelta;
  label: string;
  /** За какой период сравнение: «за сегодня» или «за неделю». */
  period: string;
}) {
  /*
   * Сравнивать не с чем — показываем серый бейдж.
   *
   * Это не ошибка: в прошлом периоде активности не было, поэтому процент
   * посчитать нельзя (делить не на что). Раньше здесь был текст «NEW» —
   * он не объяснял, что произошло и за какой срок.
   */
  if (delta.direction === "new" || delta.percent === null) {
    return (
      <span
        className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-purple-100/55"
        title={period}
      >
        {label}
      </span>
    );
  }

  const isUp = delta.direction === "up";
  return (
    <span
      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
        isUp
          ? "bg-emerald-500/15 text-emerald-300"
          : "bg-neutral-500/20 text-neutral-300"
      }`}
      // Период в подсказке: «+20%» само по себе не говорит, за какой срок.
      title={period}
    >
      {isUp ? "↑" : "↓"}
      {delta.percent >= 0 ? "+" : ""}
      {delta.percent}%
    </span>
  );
}

/* ── 3D. Achievements ───────────────────────────────────────────────── */

function AchievementsGrid() {
  const { t } = useT();

  // Достижения приходят из базы; выдача происходит в SQL-триггере.
  const achievements = useAchievementsWithState();
  const { unlockedCount, total } = useAchievementsSummary();
  const isExpanded = useAchievementsStore((s) => s.isExpanded);
  const setExpanded = useAchievementsStore((s) => s.setExpanded);

  /*
   * Показываем первые 6 плиток, остальные — по кнопке.
   *
   * Двадцать достижений в профиле занимают слишком много места и отодвигают
   * статистику. Компактная витрина + «показать все» сохраняет и обзор,
   * и доступ к полному списку.
   */
  const VISIBLE_COUNT = 6;
  const visible = isExpanded ? achievements : achievements.slice(0, VISIBLE_COUNT);
  const hiddenCount = achievements.length - VISIBLE_COUNT;

  // Прогресс считаем от тех же данных, что и статистика в профиле.
  const totalTracksPlayed = useProgressionStore((s) => s.totalTracksPlayed);
  const rankTier = useProgressionStore((s) => getRankByXp(s.totalXP).tier);
  const historyMap = useProgressionStore((s) => s.historyMap);
  const tracksByDay = useProgressionStore((s) => s.tracksByDay);
  const favoritesByDay = useProgressionStore((s) => s.favoritesByDay);
  const counters = useProgressionStore((s) => s.counters);
  const favoriteCount = useLibraryStore((s) => s.favoriteTracks.length);
  const playlists = useLibraryStore((s) => s.playlists);

  const metrics: AchievementMetrics = {
    tracksTotal: totalTracksPlayed,
    favoritesTotal: favoriteCount,
    playlistsTotal: playlists.length,
    playlistTracks: playlists.reduce(
      (max: number, playlist) => Math.max(max, playlist.tracks.length),
      0,
    ),
    /*
     * Стрик — число дней с активностью.
     *
     * Считаем объединение всех дневных историй: человек мог в какой-то день
     * только слушать музыку, в другой — только добавлять в избранное. Оба дня
     * активные, и оба должны попасть в счёт.
     */
    streakDays: collectActiveDays(historyMap, tracksByDay, favoritesByDay).length,
    questsClaimed: unlockedCount,
    rankTier,
    // Метрики, которые считает плеер (см. registerRepeatLoop и соседние).
    nightPlays: counters.nightPlays,
    sessionSeconds: counters.maxSessionSeconds,
    repeatLoops: counters.repeatLoops,
    shuffleStreak: counters.shuffleStreak,
    sourceKinds: counters.sources.length,
  };

  return (
    <div className="rounded-2xl border border-white/5 bg-neutral-950/60 p-5 backdrop-blur-md">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-purple-100/45">
          {t("dash.achievements")}
        </p>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] tabular-nums text-purple-100/55">
          {unlockedCount} / {total}
        </span>
      </div>

      <div
        className={`grid gap-4 ${
          isExpanded
            ? "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5"
            : "grid-cols-3 sm:grid-cols-6"
        }`}
      >
        {visible.map((achievement, index) => (
          <AchievementTile
            key={achievement.id}
            achievement={achievement}
            isUnlocked={achievement.isUnlocked}
            progress={getAchievementProgress(
              achievement,
              metrics,
              achievement.isUnlocked,
            )}
            current={getMetricValue(achievement, metrics)}
            delay={index * 0.03}
          />
        ))}
      </div>

      {hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(!isExpanded)}
          className="mt-4 w-full rounded-xl border border-white/10 bg-white/[0.03] py-2 text-[11px] text-purple-100/50 transition hover:bg-white/[0.07] hover:text-white"
        >
          {isExpanded
            ? t("achievement.showLess")
            : t("achievement.showAll", { count: hiddenCount })}
        </button>
      )}
    </div>
  );
}
