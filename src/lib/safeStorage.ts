import type { PersistStorage, StorageValue } from "zustand/middleware";

/**
 * Безопасное хранилище для zustand `persist`.
 *
 * ЗАЧЕМ ЭТО НУЖНО
 * ---------------
 * По умолчанию `persist` пишет в `localStorage` напрямую, и при переполнении
 * квоты (браузер даёт около 5 МБ) `setItem` БРОСАЕТ исключение.
 *
 * Проблема в том, ГДЕ оно бросается. Запись происходит синхронно внутри
 * `set()`, то есть внутри самого действия стора. В результате исключение
 * вылетает не «где-то в фоне», а прямо посреди обработки действия: состояние
 * в памяти уже изменено, а запись не прошла. Для вызывающего кода это
 * выглядит как зависание — например, свайп карточки в избранное намертво
 * останавливал интерфейс с `QuotaExceededError` в консоли.
 *
 * ЧТО ДЕЛАЕТ ОБЁРТКА
 * ------------------
 * Ловит ошибку записи и превращает её в предупреждение. Данные в памяти
 * при этом не теряются — теряется только их копия на диске, и приложение
 * продолжает работать. Это несравнимо лучше, чем замерший интерфейс.
 *
 * Если места не хватает, пробуем освободить его: удаляем записи других
 * ключей этого приложения, начиная с самых «расходных». Данные пользователя
 * (избранное, плейлисты) при этом не трогаем.
 */

/** Ключи, которые можно безопасно удалить ради места. */
const DISPOSABLE_KEYS = [
  // Очередь отложенной синхронизации: восстановится из облака.
  "noctra.sync.queue",
  // Черновики интерфейса.
  "noctra.ui.draft",
];

/**
 * Пробует освободить место, удаляя расходные ключи.
 *
 * @returns `true`, если что-то удалось удалить.
 */
function tryFreeSpace(): boolean {
  let freed = false;

  for (const key of DISPOSABLE_KEYS) {
    try {
      if (localStorage.getItem(key) !== null) {
        localStorage.removeItem(key);
        freed = true;
      }
    } catch {
      // Не удалось — не страшно, просто не освободили этот ключ.
    }
  }

  return freed;
}

/**
 * Создаёт хранилище с защитой от переполнения квоты.
 *
 * ВАЖНО ПРО ФОРМАТ
 * ----------------
 * `persist` ожидает хранилище, которое само умеет превращать объект
 * состояния в строку и обратно (`StateStorage`), а не просто кладёт строки.
 * Поэтому здесь и сериализация, и обратный разбор — с защитой на обоих
 * концах: испорченные данные в хранилище не должны ломать запуск.
 *
 * @returns Хранилище в формате, который принимает `persist`.
 */
export function createSafeStorage<T>(): PersistStorage<T> {
  return {
    getItem: (name: string) => {
      try {
        const raw = localStorage.getItem(name);
        if (!raw) return null;

        return JSON.parse(raw) as StorageValue<T>;
      } catch (error) {
        /*
         * Данные повреждены или нечитаемы. Возвращаем null — стор стартует
         * с начального состояния. Это лучше, чем упасть на старте: испорченную
         * запись всё равно не восстановить.
         */
        console.warn(
          `[storage] не удалось прочитать «${name}», начинаем с чистого состояния`,
          error instanceof Error ? error.message : "",
        );
        return null;
      }
    },

    setItem: (name: string, value: StorageValue<T>): void => {
      try {
        localStorage.setItem(name, JSON.stringify(value));
        return;
      } catch (error) {
        /*
         * Квота кончилась. Это НЕ повод падать: данные уже в памяти,
         * и приложение должно продолжать работать.
         */
        const isQuota =
          error instanceof DOMException &&
          (error.name === "QuotaExceededError" ||
            error.name === "NS_ERROR_DOM_QUOTA_REACHED");

        console.warn(
          `[storage] не удалось сохранить «${name}»` +
            (isQuota ? " — закончилось место" : "") +
            ". Данные останутся только в памяти до перезагрузки.",
        );

        /*
         * Пробуем освободить место и записать ещё раз. Если и это не вышло,
         * окончательно сдаёмся — но без исключения наружу.
         */
        if (isQuota && tryFreeSpace()) {
          try {
            localStorage.setItem(name, JSON.stringify(value));
          } catch {
            // Места всё равно нет: молча принимаем, работа продолжается.
          }
        }
      }
    },

    removeItem: (name: string): void => {
      try {
        localStorage.removeItem(name);
      } catch {
        // Удалять нечего или хранилище недоступно.
      }
    },
  };
}

/**
 * Сколько места занимает значение в байтах.
 *
 * В `localStorage` строки хранятся в UTF-16, поэтому один символ занимает
 * два байта. Помогает понять, какой ключ разросся.
 */
export function estimateSize(value: string | null): number {
  return value ? value.length * 2 : 0;
}

/**
 * Показывает, сколько занимает каждое хранилище приложения.
 *
 * Вызывается из консоли браузера при разборе проблем с местом:
 * `noctraStorageReport()`.
 */
export function noctraStorageReport(): void {
  const rows: Array<{ key: string; mb: string; note: string }> = [];
  let total = 0;

  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("noctra")) continue;

      const raw = localStorage.getItem(key);
      const size = estimateSize(raw);
      total += size;

      /*
       * Показываем не только размер, но и ЧТО внутри.
       *
       * Без этого непонятно, куда копать: ключ может весить мегабайт из-за
       * одного разросшегося поля, а не из-за общего объёма данных.
       */
      let note = "";

      try {
        const parsed = JSON.parse(raw ?? "{}");
        const state = parsed?.state ?? parsed;

        if (Array.isArray(state)) {
          note = `массив, ${state.length} элементов`;
        } else if (state && typeof state === "object") {
          const fields = Object.entries(state)
            .map(([name, value]) => {
              const valueSize = estimateSize(JSON.stringify(value));
              return { name, size: valueSize };
            })
            .sort((a, b) => b.size - a.size)
            .slice(0, 3)
            .filter((field) => field.size > 1024)
            .map((field) => `${field.name}=${(field.size / 1024).toFixed(0)}КБ`);

          note = fields.join(", ");
        }
      } catch {
        note = "не разобрать";
      }

      rows.push({ key, mb: (size / 1048576).toFixed(2), note });
    }
  } catch {
    console.warn("[storage] хранилище недоступно");
    return;
  }

  rows.sort((a, b) => Number(b.mb) - Number(a.mb));

  console.table(rows);
  console.log(
    `Всего: ${(total / 1048576).toFixed(2)} МБ из ~5 МБ ` +
      `(${((total / 5242880) * 100).toFixed(0)}% заполнено)`,
  );

  if (total > 4194304) {
    console.warn(
      "Место почти кончилось. Самый тяжёлый ключ указан первым — " +
        "его и нужно сокращать.",
    );
  }
}

/*
 * Делаем отчёт доступным из консоли браузера.
 *
 * В обычном коде экспорт модуля наружу не нужен, но для диагностики это
 * единственный способ посмотреть состояние на реальном устройстве: в APK
 * нет панели разработчика, а подключиться отладчиком получается не всегда.
 *
 * Теперь достаточно набрать в консоли `noctraStorageReport()`.
 */
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).noctraStorageReport =
    noctraStorageReport;
}
