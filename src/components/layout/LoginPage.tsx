import { useCallback, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertCircle,
  AtSign,
  CheckCircle2,
  CloudLightning,
  Loader2,
  Mail,
  Music4,
  Sparkles,
  Trophy,
  UserRound,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import logo from "../../assets/noctra-logo.png";
import { useT } from "../../i18n/useT";
import { isSupabaseConfigured } from "../../lib/supabase";
import { AmbientBackground } from "../common/AmbientBackground";
import {
  signInAnonymously,
  signInWithEmail,
  signUpWithEmail,
} from "../../services/auth";
import { GoogleSignInButton } from "../auth/GoogleSignInButton";
import { FloatingField } from "../auth/FloatingField";
import { PasswordStrength } from "../auth/PasswordStrength";
import { scorePassword } from "../auth/password-score";

type LoginPageProps = {
  onLogin: (registeredNick?: string) => void;
};

type Mode = "login" | "register";

type FieldErrors = {
  email?: string | null;
  password?: string | null;
  confirm?: string | null;
  nick?: string | null;
};

export function LoginPage({ onLogin }: LoginPageProps) {
  const { t } = useT();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [nick, setNick] = useState("");

  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isBusy, setIsBusy] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  /** Счётчик для перезапуска анимации «отмашки» при повторной ошибке. */
  const [shakeKey, setShakeKey] = useState(0);

  const cardRef = useRef<HTMLDivElement | null>(null);

  /** Ошибки Supabase приходят кодами — переводим их в текст. */
  const errorText = useCallback(
    (code: string): string => {
      const key = `login.error.${code}`;
      const translated = t(key);
      return translated === key ? t("login.error.unknown") : translated;
    },
    [t],
  );

  /** Показывает ошибку и встряхивает карточку. */
  const fail = useCallback((message: string) => {
    setFormError(message);
    setShakeKey((key) => key + 1);
  }, []);

  /**
   * Переключение режима.
   *
   * Ошибки сбрасываем здесь, а не в эффекте на `mode`: смена режима — это
   * действие пользователя, и состояние правильно менять прямо в обработчике.
   * Иначе «пароли не совпадают» осталось бы висеть при переходе на вход.
   */
  function switchMode(next: Mode) {
    if (next === mode) return;
    setMode(next);
    setFormError(null);
    setFieldErrors({});
  }

  /** Проверка полей перед отправкой. Возвращает true, если всё в порядке. */
  function validate(): boolean {
    const errors: FieldErrors = {};

    if (!email.trim()) {
      errors.email = t("login.error.emailRequired");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = t("login.error.email_invalid");
    }

    if (!password) {
      errors.password = t("login.error.passwordRequired");
    }

    if (mode === "register") {
      if (!nick.trim()) {
        errors.nick = t("login.nick.required");
      }

      if (password && password !== confirm) {
        errors.confirm = t("login.error.passwordsMismatch");
      }

      // Не даём зарегистрироваться с откровенно слабым паролем.
      if (password && scorePassword(password) === "weak") {
        errors.password = t("login.error.weak_password");
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!validate()) {
      setShakeKey((key) => key + 1);
      return;
    }

    /*
     * Без настроенного Supabase вход по email невозможен.
     * Раньше здесь происходил молчаливый вход по нику — со стороны это
     * выглядело как успешная авторизация, хотя аккаунта не создавалось
     * и данные никуда не синхронизировались. Теперь сообщаем прямо.
     */
    if (!isSupabaseConfigured) {
      fail(t("login.error.supabase_not_configured"));
      return;
    }

    setIsBusy(true);

    try {
      const result =
        mode === "register"
          ? await signUpWithEmail(email.trim(), password, nick.trim())
          : await signInWithEmail(email.trim(), password);

      if (!result.ok) {
        fail(errorText(result.code));
        return;
      }

      if (result.needsEmailConfirm) {
        fail(t("login.error.confirmEmail"));
        return;
      }

      setIsSuccess(true);
      // Даём анимации успеха доиграть перед переходом в приложение.
      window.setTimeout(() => {
        onLogin(mode === "register" ? nick.trim() : undefined);
      }, 420);
    } finally {
      setIsBusy(false);
    }
  }

  async function continueAsGuest() {
    setFormError(null);

    if (!isSupabaseConfigured) {
      onLogin();
      return;
    }

    setIsBusy(true);

    try {
      const result = await signInAnonymously();

      if (!result.ok) {
        fail(errorText(result.code));
        return;
      }

      onLogin();
    } finally {
      setIsBusy(false);
    }
  }

  const handle = nick.trim() ? `@${nick.replace(/@/g, "").trim()}` : "@nickname";

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#08080a] text-white">
      {/* Живой фон на весь экран: общий для обеих колонок, поэтому шва
          между промо-блоком и формой больше нет. */}
      <AmbientBackground variant="login" />

      {/* Контентная сетка поверх фона */}
      <div className="relative z-10 mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 px-6 py-12 lg:grid-cols-2">
        {/* ── Левая колонка: витрина (скрыта на мобильных) ───────────── */}
        <ShowcasePanel />

        {/* ── Правая колонка: форма ──────────────────────────────────── */}
        <section className="relative flex w-full flex-col items-center justify-center">
          <div
            ref={cardRef}
            key={shakeKey}
            className={`relative w-full max-w-[420px] ${
              formError ? "auth-shake" : ""
            }`}
          >
          {/* Лого на мобильных: на десктопе он живёт в витрине */}
          <div className="mb-7 flex flex-col items-center text-center lg:hidden">
            <img src={logo} alt="Noctra" className="h-24 object-contain" />
            <h1 className="mt-3 text-2xl font-bold tracking-[0.22em] text-white">
              NOCTRA
            </h1>
            <p className="mt-1.5 text-sm text-purple-100/55">
              {t("login.tagline")}
            </p>
          </div>

          {/* Матовое стекло: блики фона просвечивают сквозь карточку,
              связывая её с остальной сценой.
              `layout` анимирует изменение высоты, когда в режиме регистрации
              появляются дополнительные поля — иначе карточка «прыгает». */}
          <motion.div
            layout
            transition={{ layout: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } }}
            className="relative overflow-hidden rounded-[28px] border border-white/10 bg-neutral-900/60 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-2xl sm:p-7"
          >
            {/* Заголовок: layout="position" — текст меняется без рывка высоты */}
            <motion.div layout="position" className="mb-6 hidden lg:block">
              <h2 className="text-2xl font-bold text-white">
                {mode === "login"
                  ? t("login.welcomeBack")
                  : t("login.createTitle")}
              </h2>
              <p className="mt-1.5 text-sm text-purple-100/50">
                {mode === "login"
                  ? t("login.welcomeBack.body")
                  : t("login.createTitle.body")}
              </p>
            </motion.div>

            {/* Табы.
                Плашка одна на весь переключатель и лежит в общем контейнере,
                а не внутри кнопок: иначе Framer Motion анимирует её между
                двумя разными системами координат, и она «прыгает».
                Сдвиг задаётся через translateX(100%) — плашка всегда в
                родительском пространстве, поэтому движение строго плавное. */}
            <div className="relative mb-6 grid grid-cols-2 rounded-2xl border border-white/10 bg-white/[0.03] p-1">
              <motion.span
                aria-hidden="true"
                animate={{ x: mode === "login" ? "0%" : "100%" }}
                transition={{ type: "spring", stiffness: 450, damping: 35 }}
                className="pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-xl border border-[var(--accent-border)] bg-[var(--accent)]/25 shadow-[0_0_20px_-6px_var(--accent-glow)]"
              />

              {(["login", "register"] as Mode[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => switchMode(item)}
                  className={`relative z-10 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                    mode === item
                      ? "text-white"
                      : "text-purple-100/45 hover:text-purple-100/80"
                  }`}
                >
                  {t(
                    item === "login" ? "login.tab.login" : "login.tab.register",
                  )}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              {/*
                Google — первым: это основной способ входа.
                Компонент сам решает, показать One Tap или официальную кнопку
                Google: One Tap может быть заблокирован настройками браузера.
              */}
              <GoogleSignInButton
                onSuccess={() => {
                  setIsSuccess(true);
                  window.setTimeout(() => onLogin(), 420);
                }}
                onError={fail}
                width={320}
              />

              <div className="flex items-center gap-3 py-0.5">
                <span className="h-px flex-1 bg-white/10" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-purple-100/30">
                  {t("login.or")}
                </span>
                <span className="h-px flex-1 bg-white/10" />
              </div>

              <form onSubmit={submit} className="space-y-3.5" noValidate>
                <AnimatePresence initial={false}>
                  {mode === "register" && (
                    <motion.div
                      key="nick"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <FloatingField
                        label={t("login.nick")}
                        value={nick}
                        onChange={setNick}
                        icon={<AtSign size={15} className="m-0 block" />}
                        autoComplete="nickname"
                        error={fieldErrors.nick}
                        disabled={isBusy}
                        hint={
                          <span
                            className={`shrink-0 text-[11px] transition-colors ${
                              nick.trim()
                                ? "text-purple-200/70"
                                : "text-purple-100/25"
                            }`}
                          >
                            {handle}
                          </span>
                        }
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                <FloatingField
                  label={t("login.email")}
                  value={email}
                  onChange={setEmail}
                  type="email"
                  icon={<Mail size={15} className="m-0 block" />}
                  autoComplete="email"
                  error={fieldErrors.email}
                  disabled={isBusy}
                />

                <div>
                  <FloatingField
                    label={t("login.password")}
                    value={password}
                    onChange={setPassword}
                    type="password"
                    icon={<Sparkles size={15} className="m-0 block" />}
                    autoComplete={
                      mode === "register" ? "new-password" : "current-password"
                    }
                    error={fieldErrors.password}
                    disabled={isBusy}
                    revealable
                  />

                  {mode === "register" && <PasswordStrength password={password} />}
                </div>

                <AnimatePresence initial={false}>
                  {mode === "register" && (
                    <motion.div
                      key="confirm"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <FloatingField
                        label={t("login.confirm")}
                        value={confirm}
                        onChange={setConfirm}
                        type="password"
                        icon={<Sparkles size={15} className="m-0 block" />}
                        autoComplete="new-password"
                        error={fieldErrors.confirm}
                        disabled={isBusy}
                        revealable
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Общая ошибка входа */}
                <AnimatePresence>
                  {formError && (
                    <motion.p
                      role="alert"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-start gap-2 rounded-2xl border border-red-300/25 bg-red-500/10 px-4 py-3 text-xs leading-5 text-red-100/85"
                    >
                      <AlertCircle size={14} className="mt-0.5 shrink-0" />
                      <span>{formError}</span>
                    </motion.p>
                  )}
                </AnimatePresence>

                {/* Кнопка едет вниз/вверх вместе с раскрытием полей,
                    не ломая вёрстку: layout="position" анимирует только сдвиг. */}
                <motion.div layout="position">
                  <button
                    type="submit"
                    disabled={isBusy || isSuccess}
                    className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold text-white transition-all duration-300 disabled:cursor-not-allowed disabled:opacity-60 ${
                      isSuccess
                        ? "border-emerald-400/40 bg-emerald-500/25 shadow-[0_0_28px_-6px_rgba(16,185,129,0.6)]"
                        : "border-purple-300/30 bg-purple-500/25 shadow-lg shadow-purple-950/40 hover:border-purple-300/50 hover:bg-purple-500/35"
                    }`}
                  >
                    {isSuccess ? (
                      <>
                        <CheckCircle2 size={16} className="m-0 block" />
                        {t("login.success")}
                      </>
                    ) : (
                      <>
                        {isBusy && <Loader2 size={15} className="animate-spin" />}
                        {mode === "login" ? t("login.enter") : t("login.create")}
                      </>
                    )}
                  </button>
                </motion.div>
              </form>

              <button
                type="button"
                onClick={() => void continueAsGuest()}
                disabled={isBusy || isSuccess}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-purple-100/60 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <UserRound size={15} className="m-0 block" />
                {t("login.guest")}
              </button>
            </div>
          </motion.div>

          <p className="mt-5 text-center text-[11px] leading-5 text-purple-100/35">
            {t("login.subtitle.note")}
          </p>
          </div>
        </section>
      </div>
    </main>
  );
}

// ── Левая колонка: витрина ────────────────────────────────────────────

const FEATURES = [
  { icon: Trophy, titleKey: "login.feature.ranks", bodyKey: "login.feature.ranks.body" },
  { icon: Music4, titleKey: "login.feature.library", bodyKey: "login.feature.library.body" },
  { icon: CloudLightning, titleKey: "login.feature.sync", bodyKey: "login.feature.sync.body" },
] as const;

function ShowcasePanel() {
  const { t } = useT();

  return (
    <section className="relative hidden lg:flex lg:flex-col lg:justify-center">
      {/* Фон и блики живут в общем <AmbientBackground /> на уровне страницы,
          поэтому здесь остаётся только контент витрины. */}

      <div className="relative z-10">
        {/* Лого со свечением */}
        <div className="relative mb-8 w-fit">
          <div
            aria-hidden="true"
            className="auth-logo-pulse absolute inset-0 -z-10 rounded-full bg-[radial-gradient(circle,var(--accent-glow),transparent_62%)] blur-2xl"
          />
          <img
            src={logo}
            alt="Noctra"
            className="auth-logo-float h-40 object-contain drop-shadow-[0_0_28px_var(--accent-glow)] xl:h-48"
          />
        </div>

        <h1 className="text-5xl font-black tracking-[0.2em] text-white xl:text-6xl">
          NOCTRA
        </h1>

        <p className="mt-3 max-w-md text-base leading-7 text-purple-100/60">
          {t("login.tagline")}
        </p>

        {/* Фичи: каскадное появление */}
        <ul className="mt-12 space-y-5">
          {FEATURES.map((feature, index) => (
            <li
              key={feature.titleKey}
              className="auth-fade-up flex items-start gap-4"
              style={{ animationDelay: `${index * 110 + 120}ms` }}
            >
              <span className="inline-flex aspect-square h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-purple-300/20 bg-purple-500/10 p-0 leading-none backdrop-blur-sm">
                <feature.icon size={17} className="m-0 block text-purple-100" />
              </span>

              <span className="min-w-0">
                <span className="block text-sm font-semibold text-white">
                  {t(feature.titleKey)}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-purple-100/45">
                  {t(feature.bodyKey)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
