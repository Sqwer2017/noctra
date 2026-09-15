import { useState } from "react";
import { AtSign, Loader2, UserRound } from "lucide-react";
import logo from "../../assets/noctra-logo.png";
import bgLogin from "../../assets/bg-login.png";
import { useT } from "../../i18n/useT";
import { isSupabaseConfigured } from "../../lib/supabase";
import {
  signInAnonymously,
  signInWithEmail,
  signUpWithEmail,
} from "../../lib/supabase/auth";

type LoginPageProps = {
  onLogin: (registeredNick?: string) => void;
};

export function LoginPage({ onLogin }: LoginPageProps) {
  const { t } = useT();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [nick, setNick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  /** Ошибки Supabase приходят кодами — переводим их в текст. */
  function errorText(code: string): string {
    const key = `login.error.${code}`;
    const translated = t(key);
    // Если ключа нет, t() вернёт сам ключ — тогда показываем общий текст.
    return translated === key ? t("login.error.unknown") : translated;
  }

  async function submit() {
    setError(null);

    if (!email.trim() || !password) {
      setError(
        !email.trim()
          ? t("login.error.emailRequired")
          : t("login.error.passwordRequired"),
      );
      return;
    }

    if (mode === "register") {
      if (!nick.trim()) {
        setError(t("login.nick.required"));
        return;
      }
      if (password !== confirm) {
        setError(t("login.error.passwordsMismatch"));
        return;
      }
    }

    // Локальный режим: Supabase не настроен, входим как раньше — по нику.
    if (!isSupabaseConfigured) {
      onLogin(mode === "register" ? nick.trim() : undefined);
      return;
    }

    setIsBusy(true);

    try {
      const result =
        mode === "register"
          ? await signUpWithEmail(email.trim(), password, nick.trim())
          : await signInWithEmail(email.trim(), password);

      if (!result.ok) {
        setError(errorText(result.code));
        return;
      }

      if (result.needsEmailConfirm) {
        setError(t("login.error.confirmEmail"));
        return;
      }

      onLogin(mode === "register" ? nick.trim() : undefined);
    } finally {
      setIsBusy(false);
    }
  }

  /** Гостевой вход: анонимная сессия Supabase, данные всё равно синхронизируются. */
  async function continueAsGuest() {
    setError(null);

    if (!isSupabaseConfigured) {
      onLogin();
      return;
    }

    setIsBusy(true);

    try {
      const result = await signInAnonymously();

      if (!result.ok) {
        setError(errorText(result.code));
        return;
      }

      onLogin();
    } finally {
      setIsBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm outline-none transition placeholder:text-purple-100/35 focus:border-purple-300/40 focus:bg-black/55";

  return (
    <main className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-black text-white">
      <img
        src={bgLogin}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-70"
      />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.22),transparent_38%),linear-gradient(90deg,rgba(0,0,0,0.92),rgba(0,0,0,0.55),rgba(0,0,0,0.92))]" />

      <div className="relative z-10 w-[440px] rounded-[32px] border border-purple-300/20 bg-black/55 p-8 shadow-2xl shadow-purple-950/50 backdrop-blur-2xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src={logo} alt="Noctra" className="mb-4 h-24 object-contain" />

          <h1 className="text-3xl font-bold tracking-[0.22em] text-white">
            NOCTRA
          </h1>

          <p className="mt-2 text-sm text-purple-100/55">
            {t("login.tagline")}
          </p>
        </div>

        <div className="mb-6 grid grid-cols-2 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
          <button
            onClick={() => setMode("login")}
            className={`rounded-xl px-4 py-2 text-sm transition ${
              mode === "login"
                ? "bg-purple-500/30 text-white"
                : "text-purple-100/45 hover:text-white"
            }`}
          >
            {t("login.tab.login")}
          </button>

          <button
            onClick={() => setMode("register")}
            className={`rounded-xl px-4 py-2 text-sm transition ${
              mode === "register"
                ? "bg-purple-500/30 text-white"
                : "text-purple-100/45 hover:text-white"
            }`}
          >
            {t("login.tab.register")}
          </button>
        </div>

        <div className="space-y-4">
          {mode === "register" && (
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-purple-100/50">
              <AtSign size={14} />
              {nick.trim() ? `@${nick.replace(/@/g, "")}` : "@nickname"}
            </div>
          )}

          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("login.email")}
            className={inputCls}
          />

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("login.password")}
            className={inputCls}
          />

          {mode === "register" && (
            <>
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                type="password"
                placeholder={t("login.confirm")}
                className={inputCls}
              />

              <input
                value={nick}
                onChange={(e) => setNick(e.target.value)}
                placeholder={t("login.nick")}
                className={inputCls}
              />
            </>
          )}

          {error && (
            <p className="rounded-2xl border border-red-300/25 bg-red-500/10 px-4 py-3 text-xs text-red-100/80">
              {error}
            </p>
          )}

          <button
            onClick={() => void submit()}
            disabled={isBusy}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-purple-300/30 bg-purple-500/25 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-950/40 transition hover:bg-purple-500/35 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBusy && <Loader2 size={15} className="animate-spin" />}
            {mode === "login" ? t("login.enter") : t("login.create")}
          </button>

          <div className="flex items-center gap-3 py-1">
            <span className="h-px flex-1 bg-white/10" />
            <span className="text-[11px] uppercase tracking-widest text-purple-100/30">
              {t("login.or")}
            </span>
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <button
            onClick={() => void continueAsGuest()}
            disabled={isBusy}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-purple-100/65 transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <UserRound size={15} />
            {t("login.guest")}
          </button>
        </div>

        <p className="mt-6 text-center text-xs leading-5 text-purple-100/40">
          {t("login.subtitle.note")}
        </p>
      </div>
    </main>
  );
}
