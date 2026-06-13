import { useState } from "react";
import logo from "../../assets/noctra-logo.png";
import bgLogin from "../../assets/bg-login.png";

type LoginPageProps = {
  onLogin: () => void;
};

export function LoginPage({ onLogin }: LoginPageProps) {
  const [mode, setMode] = useState<"login" | "register">("login");

  return (
    <main className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-black text-white">
      <img
        src={bgLogin}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-70"
      />

      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.22),transparent_38%),linear-gradient(90deg,rgba(0,0,0,0.92),rgba(0,0,0,0.55),rgba(0,0,0,0.92))]" />

      <div className="relative z-10 w-[420px] rounded-[32px] border border-purple-300/20 bg-black/55 p-8 shadow-2xl shadow-purple-950/50 backdrop-blur-2xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <img src={logo} alt="Noctra" className="mb-4 h-24 object-contain" />

          <h1 className="text-3xl font-bold tracking-[0.22em] text-white">
            NOCTRA
          </h1>

          <p className="mt-2 text-sm text-purple-100/55">
            Music is identity
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
            Login
          </button>

          <button
            onClick={() => setMode("register")}
            className={`rounded-xl px-4 py-2 text-sm transition ${
              mode === "register"
                ? "bg-purple-500/30 text-white"
                : "text-purple-100/45 hover:text-white"
            }`}
          >
            Register
          </button>
        </div>

        <div className="space-y-4">
          <input
            placeholder="Email"
            className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm outline-none transition placeholder:text-purple-100/35 focus:border-purple-300/40 focus:bg-black/55"
          />

          <input
            type="password"
            placeholder="Password"
            className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm outline-none transition placeholder:text-purple-100/35 focus:border-purple-300/40 focus:bg-black/55"
          />

          {mode === "register" && (
            <input
              type="password"
              placeholder="Confirm password"
              className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm outline-none transition placeholder:text-purple-100/35 focus:border-purple-300/40 focus:bg-black/55"
            />
          )}

          <button
            onClick={onLogin}
            className="w-full rounded-2xl border border-purple-300/30 bg-purple-500/25 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-950/40 transition hover:bg-purple-500/35"
          >
            {mode === "login" ? "Enter Noctra" : "Create account"}
          </button>

          <button className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-purple-100/65 transition hover:bg-white/[0.07] hover:text-white">
            Continue with Telegram
          </button>
        </div>

        <p className="mt-6 text-center text-xs leading-5 text-purple-100/40">
          Enter your dark fantasy music space. Profile customization, modular
          windows and social features are prepared for the MVP.
        </p>
      </div>
    </main>
  );
}