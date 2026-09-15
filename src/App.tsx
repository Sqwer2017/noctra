import { useCallback, useEffect, useState } from "react";

import { AppShell } from "./components/layout/AppShell";
import { LoginPage } from "./components/layout/LoginPage";
import { ToastViewport } from "./components/ui/Toast";
import { nickToHandle } from "./lib/profile";
import { useAppStore } from "./store/useAppStore";
import { applyAccent } from "./theme";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const loadCurrentUser = useAppStore((s) => s.loadCurrentUser);

  // При первом входе гарантируем, что профиль (демо) прогружен и готов.
  useEffect(() => {
    void loadCurrentUser();
  }, [loadCurrentUser]);

  // Держим <html lang> в синхроне с выбранным/определённым языком.
  useEffect(() => {
    const apply = (state: { resolvedLocale: string }) => {
      document.documentElement.lang =
        state.resolvedLocale === "ru" ? "ru" : "en";
    };
    apply({ resolvedLocale: useAppStore.getState().resolvedLocale });
    const unsub = useAppStore.subscribe((state) => apply(state));
    return unsub;
  }, []);

  // Применяем акцентную тему (пресет + кастомный цвет) ко всему интерфейсу.
  useEffect(() => {
    const initial = useAppStore.getState();
    applyAccent(initial.accentPreset, initial.accentCustomColor);

    const unsub = useAppStore.subscribe((state) =>
      applyAccent(state.accentPreset, state.accentCustomColor),
    );
    return unsub;
  }, []);

  // Регистрация с ником: сразу создаём/обновляем профиль под юзером,
  // чтобы ни ведение соответствовало нику, введённому на форме.
  const handleEnter = useCallback(async (registeredNick?: string) => {
    const { loadCurrentUser: ensure, updateProfile } = useAppStore.getState();

    await ensure();

    if (registeredNick && registeredNick.trim()) {
      await updateProfile({
        nick: registeredNick.trim(),
        handle: nickToHandle(registeredNick),
      });
    }

    setIsAuthenticated(true);
  }, []);

  const handleLogout = useCallback(() => {
    setIsAuthenticated(false);
  }, []);

  if (!isAuthenticated) {
    return (
      <>
        <LoginPage onLogin={handleEnter} />
        <ToastViewport />
      </>
    );
  }

  return (
    <>
      <AppShell onLogout={handleLogout} />
      <ToastViewport />
    </>
  );
}
