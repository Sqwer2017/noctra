import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { AppShell } from "./components/layout/AppShell";
import { LoginPage } from "./components/layout/LoginPage";
import { GoogleAuthModal } from "./components/auth/GoogleAuthModal";
import { ToastViewport, spotlightToast } from "./components/ui/Toast";
import { AchievementToast } from "./components/ui/AchievementToast";
import { nickToHandle } from "./lib/profile";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { signOut } from "./services/auth";
import { flushSyncQueue, watchConnectivity } from "./lib/supabase/sync";
import { ensureProfileFromAuthMetadata, ProfileError } from "./lib/supabase/profile";
import { disableGoogleAutoSelect } from "./lib/google";
import { ACHIEVEMENTS } from "./lib/achievements";
import { useAppStore } from "./store/useAppStore";
import { useLibraryStore } from "./store/useLibraryStore";
import { useProgressionStore } from "./store/useProgressionStore";
import { useAchievementsStore } from "./store/useAchievementsStore";
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

  // Подтягиваем из облака избранное, плейлисты, прогресс и достижения
  // + досылаем то, что не ушло в прошлый раз из-за отсутствия сети.
  useEffect(() => {
    if (!isAuthenticated || !isSupabaseConfigured) return;

    let cancelled = false;

    void useLibraryStore.getState().hydrateFromCloud();

    /*
     * Порядок здесь принципиален: СНАЧАЛА читаем облако, ПОТОМ пишем.
     *
     * И пишем ТОЛЬКО если чтение прошло успешно.
     *
     * Раньше обе операции запускались параллельно, а гидратация при
     * недоступной сессии молча выходила. Вызывающий не знал об этом,
     * синхронизация продолжалась — и в базу уходило локальное состояние,
     * которое после выхода из аккаунта было обнулено. Так прогресс пропадал
     * при перезаходе: в профиле было 28 XP, в базе оставался 0.
     *
     * Теперь hydrate возвращает признак успеха, и запись выполняется только
     * после реально прочитанных данных.
     */
    void (async () => {
      /*
       * Повторяем чтение, если сессия ещё не успела установиться.
       *
       * Событие входа приходит раньше, чем клиент Supabase заканчивает
       * восстановление сессии, поэтому первая попытка может не найти userId.
       * Без повтора гидратация просто не состоялась бы — и синхронизация
       * не запускалась вовсе.
       */
      let hydrated = false;

      for (let attempt = 0; attempt < 5 && !cancelled; attempt++) {
        hydrated = await useProgressionStore.getState().hydrateFromCloud();
        if (hydrated) break;

        await new Promise((resolve) => window.setTimeout(resolve, 300));
      }

      if (cancelled) return;

      if (!hydrated) {
        // Прочитать не удалось — писать нельзя, иначе затрём облако.
        console.warn(
          "[sync] запись пропущена: облако не прочитано за 5 попыток",
        );
        return;
      }

      await useProgressionStore.getState().flushToCloud();
      await useAchievementsStore.getState().refresh();
    })().catch((error: unknown) => {
      console.warn("[sync] синхронизация при входе не завершилась:", error);
    });

    void flushSyncQueue();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  /*
   * Показ уведомлений об открытых достижениях.
   *
   * Достижения выдаёт база, клиент лишь узнаёт о них при обновлении списка.
   * Показываем по одному: если открылось сразу несколько, они выстроятся
   * в очередь, а не наложатся друг на друга.
   */
  const pendingAchievements = useAchievementsStore(
    (state) => state.pendingNotifications,
  );

  useEffect(() => {
    const nextId = pendingAchievements[0];
    if (!nextId) return;

    const achievement = ACHIEVEMENTS.find((item) => item.id === nextId);
    if (!achievement) {
      // Незнакомый код — просто убираем из очереди, показывать нечего.
      useAchievementsStore.getState().dismissNotification();
      return;
    }

    /*
     * Убираем из очереди ТОЛЬКО когда тост уже ушёл с экрана.
     *
     * Раньше dismissNotification() вызывался сразу после spotlightToast.
     * Это меняло массив pendingNotifications, эффект перезапускался, React
     * пересобирал узел — и AnimatePresence не успевал проиграть ни появление,
     * ни исчезновение: уведомление просто мигало. Теперь очередь двигается
     * по истечении времени показа, и анимации доходят до конца.
     */
    const LIFETIME_MS = 6000;
    spotlightToast(<AchievementToast achievement={achievement} />, LIFETIME_MS);

    const timer = window.setTimeout(() => {
      useAchievementsStore.getState().dismissNotification();
    }, LIFETIME_MS);

    return () => window.clearTimeout(timer);
  }, [pendingAchievements]);

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
  // чтобы ник и тег соответствовали введённым на форме.
  const handleEnter = useCallback(async (registeredNick?: string) => {
    const { loadCurrentUser: ensure, updateProfile } = useAppStore.getState();

    // Профиль создаётся триггером в БД; это же подтягивает его в стор.
    await ensure();

    if (registeredNick && registeredNick.trim()) {
      const nick = registeredNick.trim();

      try {
        await updateProfile({ nick, handle: nickToHandle(nick) });
      } catch (error) {
        /*
         * Тег занят — добавляем числовой суффикс.
         *
         * Тег уникален в базе, и это правильно: по нему люди находят друг
         * друга. Но отказывать в регистрации из-за совпадения нельзя — человек
         * просто выбрал популярное имя. Раньше ошибка молча глоталась, и
         * профиль оставался с техническим ником от триггера: снаружи это
         * выглядело так, будто введённое имя потерялось.
         */
        if (error instanceof ProfileError && error.code === "tag_taken") {
          const fallback = `${nickToHandle(nick)}${Math.floor(
            Math.random() * 9000 + 1000,
          )}`;

          try {
            await updateProfile({ nick, handle: fallback });
          } catch {
            // Ник останется заданный триггером — вход не блокируем.
          }
        }
      }
    }

    setIsAuthenticated(true);
  }, []);

  const handleLogout = useCallback(async () => {
    /*
     * Сохраняем прогресс ПЕРЕД выходом.
     *
     * Раньше здесь сразу шёл `signOut()`, а следом `resetLocal()` — всё, что
     * не успело уйти в базу за последние секунды, пропадало. Теперь сначала
     * дописываем накопленное (пока сессия ещё жива и запись разрешена RLS),
     * и только потом гасим сессию и чистим локальное состояние.
     */
    try {
      await useProgressionStore.getState().flushToCloud();
    } catch {
      // Выход не должен блокироваться из-за проблем с сетью.
    }

    await signOut();

    // Отключаем автовыбор Google-аккаунта, иначе One Tap сразу предложит
    // войти тем же пользователем.
    disableGoogleAutoSelect();

    useProgressionStore.getState().resetLocal();
    useLibraryStore.getState().resetLocal();
    useAchievementsStore.getState().reset();
    useAppStore.getState().setIsGuest(false);

    setIsAuthenticated(false);
  }, []);

  // После успешного входа из модалки подтягиваем данные в облаке.
  const handleAuthenticated = useCallback(() => {
    setIsAuthenticated(true);

    // Тот же порядок, что и при старте: сначала читаем, потом пишем.
    void useLibraryStore.getState().hydrateFromCloud();
    void useAchievementsStore.getState().refresh();
    void useAppStore.getState().loadCurrentUser();

    void useProgressionStore
      .getState()
      .hydrateFromCloud()
      .then((hydrated) => {
        // См. комментарий в эффекте входа: без прочитанного облака не пишем.
        if (!hydrated) return;

        return useProgressionStore.getState().flushToCloud();
      })
      .catch((error: unknown) => {
        console.warn("[sync] синхронизация после входа не завершилась:", error);
      });
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
