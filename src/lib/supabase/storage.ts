import { requireSupabase } from "../supabase";
import { currentUserId } from "./sync";

/**
 * Загрузка аватара и баннера в Supabase Storage.
 *
 * Файлы кладём в папку с uid пользователя: `<uid>/avatar-<timestamp>.webp`.
 * Политики в миграции разрешают запись только в свою папку, а чтение — всем
 * (бакеты публичные), поэтому в профиль сохраняем публичный URL.
 */

export type UploadBucket = "avatars" | "banners";

const MAX_SIZE_BYTES = 5 * 1024 * 1024;

export class UploadError extends Error {
  readonly code: "too_large" | "not_authenticated" | "upload_failed";

  constructor(code: "too_large" | "not_authenticated" | "upload_failed") {
    super(code);
    this.name = "UploadError";
    this.code = code;
  }
}

/**
 * Загружает файл и возвращает публичный URL.
 *
 * @throws UploadError с кодом, который UI переводит в понятное сообщение.
 */
export async function uploadProfileImage(
  file: File,
  bucket: UploadBucket,
): Promise<string> {
  if (file.size > MAX_SIZE_BYTES) {
    throw new UploadError("too_large");
  }

  const userId = await currentUserId();
  if (!userId) {
    throw new UploadError("not_authenticated");
  }

  const client = requireSupabase();

  // Уникальное имя: одинаковый файл, загруженный дважды, не затрёт старый,
  // а старые версии потом можно вычистить по префиксу.
  const extension = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${userId}/${bucket === "avatars" ? "avatar" : "banner"}-${Date.now()}.${extension}`;

  const { error } = await client.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type || undefined,
  });

  if (error) {
    console.warn("[storage] загрузка не удалась:", error.message);
    throw new UploadError("upload_failed");
  }

  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
