import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createSafeStorage } from "../lib/safeStorage";

import type { Playlist, PlaylistTrack } from "../types/playlist";
import { isSupabaseConfigured } from "../lib/supabase";
import { currentUserId } from "../lib/supabase/sync";
import { addFavorite, fetchFavorites, removeFavorite } from "../lib/supabase/favorites";
import {
  createPlaylistRemote,
  deletePlaylistRemote,
  deletePlaylistTrack,
  fetchPlaylists,
  insertPlaylistTrack,
  replacePlaylistTracks,
  updatePlaylistRemote,
} from "../lib/supabase/playlists";
import { useProgressionStore } from "./useProgressionStore";

/**
 * Избранное и плейлисты.
 *
 * Раньше это были два `useState` внутри AppShell с прямой записью в localStorage.
 * Вынесено в стор, потому что синхронизация должна знать `userId` и уметь
 * работать в фоне, не перерисовывая весь шелл.
 *
 * Локальный стейт обновляется сразу (оптимистично), облако догоняет в фоне.
 * В локальном режиме (Supabase не настроен) стор работает как обычное
 * localStorage-хранилище.
 */

type LibraryState = {
  favoriteTracks: PlaylistTrack[];
  playlists: Playlist[];
  /** Идёт первичная загрузка из облака. */
  isHydrating: boolean;

  // ── избранное ─────────────────────────────────────────────────────
  toggleFavoriteTrack: (track: PlaylistTrack) => void;
  removeFavoriteTrack: (trackId: string) => void;
  isFavorite: (trackId: string) => boolean;

  // ── плейлисты ─────────────────────────────────────────────────────
  createPlaylist: (playlist: Omit<Playlist, "id" | "tracks">) => void;
  updatePlaylist: (
    playlistId: string,
    playlist: Omit<Playlist, "id" | "tracks">,
  ) => void;
  deletePlaylist: (playlistId: string) => void;
  addTrackToPlaylist: (playlistId: string, track: PlaylistTrack) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;

  // ── синхронизация ─────────────────────────────────────────────────
  hydrateFromCloud: () => Promise<void>;
  resetLocal: () => void;
};

/**
 * Объединяет два списка треков без дублей по id.
 * Первый список считается приоритетным (облако), второй дополняет его.
 */
function mergeTracks(
  primary: PlaylistTrack[],
  secondary: PlaylistTrack[],
): PlaylistTrack[] {
  const seen = new Set(primary.map((track) => track.id));
  const extra = secondary.filter((track) => !seen.has(track.id));
  return [...primary, ...extra];
}

/**
 * Досылает в облако записи, которые существовали только локально.
 *
 * Без этого шага избранное, накопленное гостем до входа, осталось бы
 * на одном устройстве и при следующей загрузке выглядело потерянным.
 */
async function pushLocalOnly(
  userId: string,
  cloudFavorites: PlaylistTrack[],
  localFavorites: PlaylistTrack[],
  localOnlyPlaylists: Playlist[],
): Promise<void> {
  if (!isSupabaseConfigured) return;

  const cloudIds = new Set(cloudFavorites.map((track) => track.id));
  const missingFavorites = localFavorites.filter(
    (track) => !cloudIds.has(track.id),
  );

  for (const track of missingFavorites) {
    await addFavorite(track);
  }

  for (const playlist of localOnlyPlaylists) {
    try {
      // Переносим плейлист вместе с треками: иначе в облаке он окажется пустым.
      const created = await createPlaylistRemote(userId, {
        name: playlist.name,
        description: playlist.description,
        cover: playlist.cover,
        privacy: playlist.privacy,
      });

      if (playlist.tracks.length > 0) {
        await replacePlaylistTracks(created.id, playlist.tracks);
      }
    } catch (error) {
      console.warn("[library] не удалось перенести плейлист в облако:", error);
    }
  }
}

/**
 * Убирает из трека поля, которые не нужно хранить.
 *
 * ЗАЧЕМ
 * -----
 * `streamUrl` и `coverUrl` — это готовые адреса, и они собираются заново
 * из `fileId` при каждой загрузке. В хранилище они занимают больше половины
 * записи, а пользы не несут: при смене домена бэкенда такие сохранённые
 * адреса становятся нерабочими.
 *
 * Освободившееся место важно: переполнение квоты localStorage роняло
 * интерфейс при добавлении трека в избранное.
 */
function stripVolatileFields(track: PlaylistTrack): PlaylistTrack {
  /*
   * Копируем объект и удаляем лишние ключи.
   *
   * Через деструктуризацию с `...rest` было бы короче, но линтер справедливо
   * ругается на неиспользуемые переменные. Здесь намерение видно явно:
   * эти два поля не сохраняем.
   */
  const copy: Record<string, unknown> = { ...track };

  delete copy.streamUrl;
  delete copy.coverUrl;

  return copy as PlaylistTrack;
}

export const useLibraryStore = create<LibraryState>()(  persist(
    (set, get) => ({
      favoriteTracks: [],
      playlists: [],
      isHydrating: false,

      isFavorite: (trackId) =>
        get().favoriteTracks.some((track) => track.id === trackId),

      toggleFavoriteTrack: (track) => {
        const alreadyFavorite = get().favoriteTracks.some(
          (item) => item.id === track.id,
        );

        if (alreadyFavorite) {
          get().removeFavoriteTrack(track.id);
          return;
        }

        // Оптимистично: трек появляется в избранном мгновенно.
        set((state) => ({
          favoriteTracks: [track, ...state.favoriteTracks],
        }));

        /*
         * XP за избранное решает БАЗА, а не клиент.
         *
         * addFavorite возвращает фактически начисленную сумму: 2 за новый
         * трек и 0, если за этот трек уже платили. Раньше клиент безусловно
         * начислял +2 за каждое добавление, и опыт абузился парой кликов
         * по сердечку (поставил → снял → поставил).
         *
         * Квест «Коллекционер» считает действия независимо от награды —
         * ему нужны добавления, а не уникальные треки.
         */
        void addFavorite(track).then((awardedXp) => {
          useProgressionStore.getState().registerFavoriteAdded(track.id, awardedXp);
        });
      },

      removeFavoriteTrack: (trackId) => {
        set((state) => ({
          favoriteTracks: state.favoriteTracks.filter(
            (track) => track.id !== trackId,
          ),
        }));

        void removeFavorite(trackId);
      },

      createPlaylist: (playlist) => {
        // id генерирует БД, поэтому в облачном режиме ждём ответ и только
        // потом показываем плейлист. В локальном — создаём сразу.
        if (isSupabaseConfigured) {
          void (async () => {
            const userId = await currentUserId();
            if (!userId) return;

            try {
              const created = await createPlaylistRemote(userId, playlist);
              set((state) => ({ playlists: [created, ...state.playlists] }));
            } catch (error) {
              console.warn("[library] не удалось создать плейлист:", error);
            }
          })();

          return;
        }

        const localPlaylist: Playlist = {
          id: crypto.randomUUID(),
          tracks: [],
          ...playlist,
        };

        set((state) => ({ playlists: [localPlaylist, ...state.playlists] }));
      },

      updatePlaylist: (playlistId, updatedPlaylist) => {
        set((state) => ({
          playlists: state.playlists.map((playlist) =>
            playlist.id === playlistId
              ? { ...playlist, ...updatedPlaylist }
              : playlist,
          ),
        }));

        void updatePlaylistRemote(playlistId, updatedPlaylist);
      },

      deletePlaylist: (playlistId) => {
        set((state) => ({
          playlists: state.playlists.filter(
            (playlist) => playlist.id !== playlistId,
          ),
        }));

        void deletePlaylistRemote(playlistId);
      },

      addTrackToPlaylist: (playlistId, track) => {
        const playlist = get().playlists.find((item) => item.id === playlistId);
        if (!playlist) return;
        if (playlist.tracks.some((item) => item.id === track.id)) return;

        const nextTracks = [...playlist.tracks, track];

        set((state) => ({
          playlists: state.playlists.map((item) =>
            item.id === playlistId ? { ...item, tracks: nextTracks } : item,
          ),
        }));

        // XP за публичный плейлист с достаточным числом треков.
        // ВАЖНО: вне updater'а set() — иначе в StrictMode, где updater
        // выполняется дважды, награда начислялась бы дважды.
        useProgressionStore
          .getState()
          .registerPublicPlaylistComplete(
            playlist.privacy === "Public",
            nextTracks.length,
          );

        void insertPlaylistTrack(playlistId, track, nextTracks.length - 1);
      },

      removeTrackFromPlaylist: (playlistId, trackId) => {
        set((state) => ({
          playlists: state.playlists.map((playlist) =>
            playlist.id === playlistId
              ? {
                  ...playlist,
                  tracks: playlist.tracks.filter((track) => track.id !== trackId),
                }
              : playlist,
          ),
        }));

        void deletePlaylistTrack(playlistId, trackId);
      },

      hydrateFromCloud: async () => {
        if (!isSupabaseConfigured) return;

        const userId = await currentUserId();
        if (!userId) return;

        set({ isHydrating: true });

        try {
          const [cloudFavorites, cloudPlaylists] = await Promise.all([
            fetchFavorites(userId),
            fetchPlaylists(userId),
          ]);

          const localFavorites = get().favoriteTracks;
          const localPlaylists = get().playlists;

          // ── Слияние вместо перезаписи ──────────────────────────────
          // Гость мог накопить избранное и плейлисты локально. Если просто
          // заменить их облачными, его данные пропадут. Поэтому объединяем:
          // облачные записи идут первыми (они авторитетнее), а локальные
          // добавляются, если такого трека там ещё нет.
          const mergedFavorites = mergeTracks(cloudFavorites, localFavorites);

          // Плейлисты сливаем по id: совпадающие берём из облака (там
          // актуальная версия), локальные уникальные добавляем.
          const cloudIds = new Set(cloudPlaylists.map((playlist) => playlist.id));
          const localOnly = localPlaylists.filter(
            (playlist) => !cloudIds.has(playlist.id),
          );

          const mergedPlaylists = [...cloudPlaylists, ...localOnly];

          set({
            favoriteTracks: mergedFavorites,
            playlists: mergedPlaylists,
          });

          // Локальные записи, которых не было в облаке, надо дослать,
          // иначе они останутся только на этом устройстве.
          await pushLocalOnly(userId, cloudFavorites, localFavorites, localOnly);
        } finally {
          set({ isHydrating: false });
        }
      },

      resetLocal: () => set({ favoriteTracks: [], playlists: [] }),
    }),
    {
      name: "noctra.library",
      storage: createSafeStorage(),
      /*
       * СОХРАНЯЕМ ТОЛЬКО ПОСТОЯННЫЕ ПОЛЯ.
       *
       * `streamUrl` и `coverUrl` — это АДРЕСА, и они собираются заново при
       * каждой загрузке из `fileId` (см. `repairTrack` в telegramTracks.ts).
       * Хранить их бессмысленно: они занимают больше половины записи,
       * а при переезде бэкенда на другой домен ещё и становятся неверными.
       *
       * Плюс именно такие «длинные» строки быстрее всего съедают квоту
       * localStorage — а её переполнение раньше роняло интерфейс.
       */
      partialize: (state) => ({
        favoriteTracks: state.favoriteTracks.map(stripVolatileFields),
        playlists: state.playlists.map((playlist) => ({
          ...playlist,
          tracks: playlist.tracks.map(stripVolatileFields),
        })),
      }),
    },
  ),
);
