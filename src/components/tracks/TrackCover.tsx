import { memo, useCallback, useState } from "react";
import { Music } from "lucide-react";

import type { PlaylistTrack } from "../../types/playlist";
import {
  youTubeCoverUrl,
  YOUTUBE_COVER_QUALITIES,
} from "../../lib/youtubeCover";

type TrackCoverProps = {
  track: PlaylistTrack;
  size?: string;
  /** Курсор над обложкой: лёгкий зум и затемнение под иконку Play/Pause. */
  interactive?: boolean;
};

/**
 * Миниатюра обложки.
 *
 * Картинки грузятся нативно-лениво и декодируются асинхронно: в виртуализированном
 * списке одновременно живёт ~15 карточек, и `decoding="async"` не даёт декодированию
 * блокировать главный поток во время скролла.
 *
 * ОТДЕЛЬНО ПРО YOUTUBE
 * --------------------
 * Обложки таких треков приходят с CDN Google. Если картинка не загрузилась
 * (видео удалено, ссылка устарела, сеть моргнула), пробуем другое качество,
 * и только потом показываем заглушку. Без этого в списке оставались бы серые
 * квадраты, хотя картинка почти всегда доступна в другом размере.
 */
export const TrackCover = memo(function TrackCover({
  track,
  size = "h-12 w-12",
  interactive = false,
}: TrackCoverProps) {
  /**
   * Сколько раз уже переключали качество.
   *
   * Считаем попытки, а не запоминаем конкретный URL: так при смене трека
   * достаточно сбросить счётчик, и логика остаётся простой.
   */
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  /** Обложка не загрузилась: пробуем следующее качество, затем заглушку. */
  const handleError = useCallback(() => {
    if (!track.videoId) {
      setFailed(true);
      return;
    }

    if (attempt < YOUTUBE_COVER_QUALITIES.length - 1) {
      setAttempt((value) => value + 1);
      return;
    }

    setFailed(true);
  }, [attempt, track.videoId]);

  /*
   * Актуальный адрес обложки.
   *
   * Для YouTube он всегда собирается из идентификатора видео: ссылки зеркал
   * ломаются вместе с зеркалами, а CDN Google стабилен. Для остальных
   * источников используется то, что пришло вместе с треком.
   */
  const coverUrl =
    track.videoId && track.source === "YouTube"
      ? youTubeCoverUrl(track.videoId, YOUTUBE_COVER_QUALITIES[attempt])
      : track.coverUrl;

  const showImage = Boolean(coverUrl) && !failed;

  return (
    <div
      className={`relative ${size} shrink-0 overflow-hidden rounded-xl border border-purple-300/10 bg-black`}
    >
      {showImage ? (
        <img
          /*
           * Ключ привязан к адресу: при смене качества React пересоздаёт
           * элемент, и браузер действительно пробует новую ссылку, а не
           * показывает прежнюю ошибку из кэша.
           */
          key={coverUrl}
          src={coverUrl ?? undefined}
          alt=""
          draggable={false}
          loading="lazy"
          decoding="async"
          onError={handleError}
          className={`absolute inset-0 h-full w-full object-cover transition duration-200 ${
            interactive
              ? "scale-[1.14] brightness-[0.55]"
              : "scale-[1.08]"
          }`}
        />
      ) : (
        <div
          className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-purple-500/35 to-black transition ${
            interactive ? "brightness-[0.55]" : ""
          }`}
        >
          <Music size={18} className="text-purple-100/65" />
        </div>
      )}
    </div>
  );
});
