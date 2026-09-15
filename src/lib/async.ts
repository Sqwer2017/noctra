/**
 * Мини-утилиты отложенного и «склеенного» выполнения.
 *
 * Нужны для синхронизации с Supabase: прослушивание тикает раз в секунду,
 * лайки и правки профиля — пачками. Без них каждый тик уходил бы отдельным
 * HTTP-запросом, что быстро упрётся в лимиты и разрядит батарею.
 */

/** Откладывает вызов до паузы в активности; сбрасывает таймер при новом вызове. */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  waitMs: number,
): ((...args: Args) => void) & { cancel: () => void; flush: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Args | null = null;

  const invoke = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pendingArgs) {
      const args = pendingArgs;
      pendingArgs = null;
      fn(...args);
    }
  };

  const debounced = (...args: Args) => {
    pendingArgs = args;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(invoke, waitMs);
  };

  debounced.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pendingArgs = null;
  };

  /** Немедленно выполнить отложенный вызов (например, при уходе со страницы). */
  debounced.flush = invoke;

  return debounced;
}

/**
 * Ограничивает частоту вызовов: первый вызов проходит сразу, следующие —
 * не чаще `intervalMs`. Полезно для записи прогресса прослушивания.
 */
export function throttle<Args extends unknown[]>(
  fn: (...args: Args) => void,
  intervalMs: number,
): ((...args: Args) => void) & { cancel: () => void } {
  let lastCall = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Args | null = null;

  const throttled = (...args: Args) => {
    const now = Date.now();
    const elapsed = now - lastCall;

    if (elapsed >= intervalMs) {
      lastCall = now;
      fn(...args);
      return;
    }

    // Запоминаем последний аргумент: выполним его по истечении окна.
    pendingArgs = args;
    if (timer === null) {
      timer = setTimeout(() => {
        timer = null;
        lastCall = Date.now();
        if (pendingArgs) {
          const queued = pendingArgs;
          pendingArgs = null;
          fn(...queued);
        }
      }, intervalMs - elapsed);
    }
  };

  throttled.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pendingArgs = null;
  };

  return throttled;
}
