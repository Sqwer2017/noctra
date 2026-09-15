import { useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import type { PlaylistTrack } from "../../types/playlist";
import { TrackRow } from "./TrackRow";

type VirtualTrackListProps = {
  tracks: PlaylistTrack[];
  /** Полный список, который уходит в плейлист воспроизведения (не только видимые). */
  queue?: PlaylistTrack[];
  currentTrackId: string | null;
  isPlaying: boolean;
  isFavorite: (track: PlaylistTrack) => boolean;
  onPlay?: (track: PlaylistTrack, queue?: PlaylistTrack[]) => void;
  onTogglePlay?: () => void;
  onQueue?: (track: PlaylistTrack) => void;
  onToggleFavoriteTrack?: (track: PlaylistTrack) => void;
  onAdd?: (track: PlaylistTrack) => void;
  onRemove?: (track: PlaylistTrack) => void;
  addTitle?: string;
  removeTitle?: string;
  /** Высота строки: карточка + gap. */
  estimateSize?: number;
};

/**
 * Виртуализированный список треков.
 *
 * В DOM живут только строки, попавшие во вьюпорт (+5 сверху и снизу), поэтому
 * 100, 500 или 1000 треков рендерятся одинаково дешёво. Для этого каждая строка
 * обёрнута в абсолютно позиционированный контейнер фиксированной высоты, а
 * собственный отступ строки (`space-y`) заменён на `paddingBottom` внутри ячейки —
 * так измеренная высота остаётся точной и скроллбар не «прыгает».
 */
export function VirtualTrackList({
  tracks,
  queue,
  currentTrackId,
  isPlaying,
  isFavorite,
  onPlay,
  onTogglePlay,
  onQueue,
  onToggleFavoriteTrack,
  onAdd,
  onRemove,
  addTitle,
  removeTitle,
  estimateSize = 80,
}: VirtualTrackListProps) {
  const scrollParentRef = useRef<HTMLDivElement | null>(null);

  // Стабильная ссылка на скролл-контейнер: useVirtualizer ожидает колбек с
  // постоянной идентичностью, иначе пересоздаёт обсерверы на каждом рендере.
  const getScrollElement = useCallback(() => scrollParentRef.current, []);

  const virtualizer = useVirtualizer({
    count: tracks.length,
    getScrollElement,
    // Высота строки фиксированная, поэтому измерение DOM не нужно: динамический
    // `measureElement` заставил бы ResizeObserver пересчитывать весь список и
    // раздул бы число узлов. Курсор и освобождение памяти берёт на себя сам
    // виртуализатор.
    estimateSize: () => estimateSize,
    overscan: 5,
    getItemKey: (index) => tracks[index]?.id ?? index,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollParentRef}
      className="min-h-0 max-h-full flex-1 overflow-y-auto overflow-x-hidden pr-1 noctra-scrollbar"
    >
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualItems.map((virtualRow) => {
          const track = tracks[virtualRow.index];

          if (!track) return null;

          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              className="absolute left-0 top-0 w-full pb-3"
              style={{ height: estimateSize, transform: `translateY(${virtualRow.start}px)` }}
            >
              <TrackRow
                track={track}
                queue={queue ?? tracks}
                isCurrent={track.id === currentTrackId}
                isPlaying={isPlaying}
                isFavorite={isFavorite(track)}
                onPlay={onPlay}
                onTogglePlay={onTogglePlay}
                onQueue={onQueue}
                onToggleFavoriteTrack={onToggleFavoriteTrack}
                onAdd={onAdd}
                onRemove={onRemove}
                addTitle={addTitle}
                removeTitle={removeTitle}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
