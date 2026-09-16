/**
 * Расчёт прогресса для плиток статистики в профиле.
 *
 * Задача: показать, стало ли лучше, чем в прошлом периоде. Для разных метрик
 * период разный:
 *
 *  - время прослушивания, треки, избранное — сравнение сегодняшнего дня
 *    со вчерашним: это ежедневные действия, интересна свежая динамика;
 *  - дни активности — сравнение текущей недели с прошлой: за один день
 *    метрика не показательная, «активен 1 день из 7» понятнее в масштабе
 *    недели.
 *
 * Все расчёты идут по локальной дате: пользователь видит свои сутки, а не UTC.
 * Иначе у людей восточнее Гринвича «сегодня» начиналось бы среди дня.
 */

/** Результат сравнения периодов. */
export type StatDelta = {
  /** Изменение в процентах; null — сравнивать не с чем. */
  percent: number | null;
  direction: "up" | "down" | "new";
};

/** Ключ даты в формате YYYY-MM-DD по локальному времени. */
export function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Смещает дату на указанное число дней назад. */
function shiftDays(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setDate(date.getDate() + days);
  return shifted;
}

/**
 * Начало недели (понедельник) для указанной даты.
 *
 * `getDay()` возвращает 0 для воскресенья, поэтому приводим к «понедельник = 0»:
 * без этого неделя начиналась бы с воскресенья, и «прошлая неделя» съезжала бы.
 */
function startOfWeek(date: Date): Date {
  const dayIndex = (date.getDay() + 6) % 7;
  const start = new Date(date);
  start.setDate(date.getDate() - dayIndex);
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * Сравнивает два числа и превращает разницу в проценты.
 *
 * Если в прошлом периоде было ноль, процент посчитать нельзя — делить не на что.
 * Это не ошибка, а отсутствие базы сравнения, поэтому возвращаем `new`.
 */
function toDelta(current: number, previous: number): StatDelta {
  if (previous <= 0) {
    return { percent: null, direction: "new" };
  }

  const percent = Math.round(((current - previous) / previous) * 100);

  return { percent, direction: percent >= 0 ? "up" : "down" };
}

/** Сумма значений истории за конкретную дату. */
function valueAt(history: Record<string, number>, date: Date): number {
  return history[localDateKey(date)] ?? 0;
}

/**
 * Дельта «сегодня против вчера» по дневной истории.
 *
 * Используется для времени прослушивания, треков и избранного.
 */
export function computeDailyDelta(
  history: Record<string, number>,
  now = new Date(),
): StatDelta {
  const today = valueAt(history, now);
  const yesterday = valueAt(history, shiftDays(now, -1));

  return toDelta(today, yesterday);
}

/**
 * Дельта «эта неделя против прошлой».
 *
 * Считает сумму значений за каждый период. Для времени прослушивания это
 * минуты, для треков и лайков — штуки; функция работает с любой дневной
 * историей одинаково.
 */
export function computeWeeklyDelta(
  history: Record<string, number>,
  now = new Date(),
): StatDelta {
  const thisWeekStart = startOfWeek(now);
  const lastWeekStart = shiftDays(thisWeekStart, -7);

  let current = 0;
  let previous = 0;

  for (let offset = 0; offset < 7; offset++) {
    current += valueAt(history, shiftDays(thisWeekStart, offset));
    previous += valueAt(history, shiftDays(lastWeekStart, offset));
  }

  return toDelta(current, previous);
}

/**
 * Сколько дней на этой неделе были активны.
 *
 * Активным считается день, в котором есть хоть какая-то запись: прослушивание,
 * дослушанный трек или добавление в избранное. Возвращает число от 0 до 7 —
 * оно и показывается как «3 / 7».
 */
export function countActiveDaysThisWeek(
  activeDates: string[],
  now = new Date(),
): number {
  const weekStart = startOfWeek(now);
  const weekKeys = new Set<string>();

  for (let offset = 0; offset < 7; offset++) {
    weekKeys.add(localDateKey(shiftDays(weekStart, offset)));
  }

  // Считаем уникальные даты: в списке их может быть несколько из разных историй.
  const active = new Set(activeDates.filter((date) => weekKeys.has(date)));

  return active.size;
}

/**
 * Дельта по числу активных дней: эта неделя против прошлой.
 *
 * Отличие от `computeWeeklyDelta` в том, что считаются УНИКАЛЬНЫЕ дни,
 * а не сумма значений: «активен 5 дней» — это про охват недели, а не про
 * объём активности. Суммировать было бы неверно.
 */
export function computeActiveDaysDelta(
  activeDates: string[],
  now = new Date(),
): StatDelta {
  const unique = new Set(activeDates);

  const countInWeek = (weekStart: Date) => {
    const keys = new Set<string>();
    for (let offset = 0; offset < 7; offset++) {
      keys.add(localDateKey(shiftDays(weekStart, offset)));
    }
    let count = 0;
    for (const date of keys) {
      if (unique.has(date)) count += 1;
    }
    return count;
  };

  const thisWeekStart = startOfWeek(now);
  const current = countInWeek(thisWeekStart);
  const previous = countInWeek(shiftDays(thisWeekStart, -7));

  return toDelta(current, previous);
}
