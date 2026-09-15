/**
 * Модель профиля пользователя.
 *
 * Дизайн заточен под будущий Supabase:
 *  - id соответствует supabase.auth uid (сейчас — demo-uid);
 *  - avatarUrl / coverUrl в продакшене станут публичными storage-ссылками,
 *    сейчас это dataURL/base64 из локального загрузчика файлов.
 *  - числовые счётчики (followers/following/playlists) в перспективе будут
 *    приезжать с сервера/БД, пока это локальные фоллбэки.
 */

export type UserProfile = {
  id: string;
  /** Отображаемое имя (ник). */
  nick: string;
  /** Хендл вида "@nick". */
  handle: string;
  /** Короткий статус-строка, отображается над био. */
  status: string;
  /** Биография. */
  bio: string;
  /** Ранг/ава-звание (пока текстовое поле-задел). */
  rank: string;
  /** Аватар: dataURL сейчас / ссылка на storage после деплоя. */
  avatarUrl: string | null;
  /** Банер профиля: dataURL сейчас / ссылка на storage после деплоя. */
  coverUrl: string | null;
  /** Followers — в перспективе из БД. TODO(supabase): заменить на серверное. */
  followers: number;
  following: number;
};

export type UserProfileInput = Partial<
  Pick<
    UserProfile,
    | "nick"
    | "handle"
    | "status"
    | "bio"
    | "rank"
    | "avatarUrl"
    | "coverUrl"
  >
>;
