import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { AppShell } from "./components/layout/AppShell";
import { LoginPage } from "./components/layout/LoginPage";
import { GoogleAuthModal } from "./components/auth/GoogleAuthModal";
import { ToastViewport } from "./components/ui/Toast";
import { nickToHandle } from "./lib/profile";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { signOut } from "./services/auth";
import { flushSyncQueue, watchConnectivity } from "./lib/supabase/sync";
import { ensureProfileFromAuthMetadata } from "./lib/supabase/profile";
import { disableGoogleAutoSelect } from "./lib/google";
import { useAppStore } from "./store/useAppStore";
import { useLibraryStore } from "./store/useLibraryStore";
import { useProgressionStore } from "./store/useProgressionStore";
import { applyAccent } from "./theme";

export default function App() {
  // В локальном режиме Supabase Auth недоступен, поэтому вход по нику —
  // единственный сценарий, и пользователь считается вошедшим сразу.
  const [isAuthenticated, setIsAuthenticated] = useState(!isSupabaseConfigured);
  const [isAuthChecking, setIsAuthChecking] = useState(isSupabaseConfigured);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // ── сессия Supabase ────────────────────────────────────────────────
  // Источник правды о входе — сессия клиента Supabase. Она сохраняется
  // в localStorage и переживает перезагрузку, поэтому F5 больше не выкидывает
  // пользователя на экран логина.
  useEffect(() => {
    if (!supabase) return;

    let isMounted = true;

    /** Применяет состояние сессии к стору: профиль, признак гостя. */
    const applySession = (session: Session | null) => {
      setIsAuthenticated(Boolean(session));

      // Анонимный пользователь = гость: данные синхронизируются, но аккаунт
      // не привязан к почте, поэтому показываем кнопку «Войти».
      useAppStore.getState().setIsGuest(Boolean(session?.user?.is_anonymous));

      if (!session) return;

      // Онбординг: подставляем имя и аватар из Google, если профиль пустой.
      void ensureProfileFromAuthMetadata().then((updated) => {
        if (updated) console.info("[auth] профиль дополнен данными аккаунта");
        return useAppStore.getState().loadCurrentUser();
      });
    };

    void supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      applySession(data.session);
      setIsAuthChecking(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!isMounted) return;
        applySession(session);
        setIsAuthChecking(false);
      },
    );

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // Профиль грузим, когда пользователь уже определён.
  useEffect(() => {
    if (!isAuthenticated) return;
    void useAppStore.getState().loadCurrentUser();
  }, [isAuthenticated]);

  // Подтягиваем из облака избранное, плейлисты и прогресс + досылаем то,
  // что не ушло в прошлый раз из-за отсутствия сети.
  useEffect(() => {
    if (!isAuthenticated || !isSupabaseConfigured) return;

    void useLibraryStore.getState().hydrateFromCloud();
    void useProgressionStore.getState().hydrateFromCloud();
    void flushSyncQueue();
  }, [isAuthenticated]);

  // Возвращение сети — повод дослать отложенные операции.
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    return watchConnectivity((count) => {
      console.info(`[sync] дослано операций: ${count}`);
    });
  }, []);

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
      try {
        await updateProfile({
          nick: registeredNick.trim(),
          handle: nickToHandle(registeredNick),
        });
      } catch {
        // Профиль уже создан триггером в БД — не блокируем вход из-за
        // неудавшегося переименования.
      }
    }

    setIsAuthenticated(true);
  }, []);

  const handleLogout = useCallback(async () => {
    // Сначала гасим сессию, затем чистим локальное состояние: иначе
    // onAuthStateChange успеет перезагрузить профиль уходящего пользователя.
    await signOut();

    // Отключаем автовыбор Google-аккаунта, иначе One Tap сразу предложит
    // войти тем же пользователем.
    disableGoogleAutoSelect();

    useProgressionStore.getState().resetLocal();
    useLibraryStore.getState().resetLocal();
    useAppStore.getState().setIsGuest(false);

    setIsAuthenticated(false);
  }, []);

  // После успешного входа из модалки подтягиваем данные в облаке.
  const handleAuthenticated = useCallback(() => {
    setIsAuthenticated(true);
    void useLibraryStore.getState().hydrateFromCloud();
    void useProgressionStore.getState().hydrateFromCloud();
    void useAppStore.getState().loadCurrentUser();
  }, []);

  // Пока проверяем сессию, показываем заглушку — иначе экран логина мигнёт
  // у уже авторизованного пользователя.
  if (isAuthChecking) {
    return <AuthSplash />;
  }

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
      <AppShell
        onLogout={handleLogout}
        onRequestSignIn={() => setIsAuthModalOpen(true)}
      />

      <GoogleAuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthenticated={handleAuthenticated}
      />

      <ToastViewport />
    </>
  );
}

/** Экран ожидания проверки сессии. */
function AuthSplash() {
  return (
    <main className="flex h-screen w-screen items-center justify-center bg-black">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-300/25 border-t-purple-300" />
    </main>
  );
}
