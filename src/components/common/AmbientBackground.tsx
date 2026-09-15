/**
 * AmbientBackground — живой фон приложения.
 *
 * Крупные размытые сферы света, которые медленно дрейфуют по экрану.
 * Используется на экране входа и в рабочем столе, поэтому лежит в common.
 *
 * ЦВЕТ ПОЛНОСТЬЮ ЗАВИСИТ ОТ ТЕМЫ.
 * Раньше сферы были захардкожены (emerald/teal/purple), и при смене акцента
 * в настройках фон оставался прежним — теперь каждая сфера берёт оттенок из
 * акцентной палитры (`--accent*`), которую проставляет applyAccent. Смена
 * темы мгновенно перекрашивает и интерфейс, и фон.
 *
 * Оттенки внутри палитры дают разнообразие, не выпадая из темы:
 *   --accent-soft   — светлый тон (самая заметная сфера),
 *   --accent        — основной,
 *   --accent-strong — насыщенный,
 *   --accent-deep   — тёмный (глубина),
 *   --accent-glow   — полупрозрачный для свечения.
 *
 * Производительность (важно):
 *  - анимируются только `transform` и `opacity` — оба обрабатываются
 *    композитором на GPU, без пересчёта layout и перерисовки;
 *  - `filter: blur(...)` статичен и задан классом: анимировать blur нельзя,
 *    браузер пересчитывал бы размытие каждый кадр — это очень дорого;
 *  - смена цвета темы меняет только `background`, размытие при этом не
 *    пересчитывается на каждом кадре.
 *
 * Слой декоративный: `pointer-events-none`, `aria-hidden` — он не должен
 * перехватывать клики и попадать в скринридеры.
 */

type AmbientBackgroundProps = {
  /**
   * `login` — усиленный вариант для экрана входа (сферы заметнее).
   * `default` — приглушённый для рабочего стола, чтобы не мешать чтению списков.
   */
  variant?: "default" | "login";
  className?: string;
};

export function AmbientBackground({
  variant = "default",
  className = "",
}: AmbientBackgroundProps) {
  const isLogin = variant === "login";

  /*
   * Яркость сфер.
   *
   * Blur сильно рассеивает цвет, поэтому одного плотного цвета мало: после
   * размытия на почти чёрном фоне остаётся едва заметный оттенок.
   * Компенсируем непрозрачностью слоя — на входе света больше (экран должен
   * «продавать» атмосферу), в рабочем столе умереннее, чтобы не мешать
   * чтению списков треков.
   */
  const screenOpacity = isLogin ? "opacity-90" : "opacity-70";

  return (
    <div
      aria-hidden="true"
      role="presentation"
      className={`pointer-events-none fixed inset-0 z-0 select-none overflow-hidden bg-[#08080a] ${className}`}
    >
      {/* Сфера 1: самая заметная, слева-сверху. Светлый тон темы. */}
      <div
        className={`animate-float-slow absolute -left-[10%] -top-[10%] h-[420px] w-[420px] rounded-full blur-[110px] sm:h-[560px] sm:w-[560px] sm:blur-[120px] ${screenOpacity}`}
        style={{ background: "var(--accent-soft)" }}
      />

      {/* Сфера 2: справа-снизу — светит из-под карточки входа. Основной тон. */}
      <div
        className={`animate-float-reverse absolute -bottom-[15%] -right-[5%] h-[480px] w-[480px] rounded-full blur-[120px] sm:h-[660px] sm:w-[660px] sm:blur-[130px] ${screenOpacity}`}
        style={{ background: "var(--accent)" }}
      />

      {/* Сфера 3: глубокая тень по центру-верху. Тёмный тон даёт объём. */}
      <div
        className="animate-pulse-slow absolute left-[32%] top-[22%] h-[400px] w-[400px] rounded-full blur-[110px] sm:h-[480px] sm:w-[480px]"
        style={{ background: "var(--accent-deep)" }}
      />

      {/* Сфера 4: насыщенный оттенок слева-снизу. */}
      <div
        className={`animate-drift-wide absolute bottom-[10%] left-[15%] h-[340px] w-[340px] rounded-full blur-[100px] sm:h-[420px] sm:w-[420px] ${screenOpacity}`}
        style={{ background: "var(--accent-strong)" }}
      />

      {/* Сфера 5: ядро в центре — «дышащее» свечение акцента.
          radial-gradient даёт мягкий переход без резкой границы круга. */}
      <div
        className="animate-glow-breathe absolute left-1/2 top-1/2 h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[130px] sm:h-[420px] sm:w-[420px]"
        style={{
          background:
            "radial-gradient(circle, var(--accent-glow), transparent 70%)",
        }}
      />

      {/* Виньетка: лишь слегка притемняет низ, чтобы текст читался.
          Раньше была плотной (85%) и «съедала» блики — теперь мягкая. */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#08080a]/55" />

      {/* Тонкая сетка — связывает фон с остальным интерфейсом */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.022)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.022)_1px,transparent_1px)] bg-[size:80px_80px] opacity-40" />
    </div>
  );
}
