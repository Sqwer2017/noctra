import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

/**
 * Минимальная система тостов без провайдера.
 * Любой модуль может вызвать `toast("текст")`, а <ToastViewport /> в корне
 * отрисует сообщения.
 */

type ToastItem = {
  id: number;
  message: string;
};

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(items);
}

export function toast(message: string, durationMs = 2000) {
  const id = nextId++;
  items = [...items, { id, message }];
  emit();

  window.setTimeout(() => {
    items = items.filter((item) => item.id !== id);
    emit();
  }, durationMs);
}

export function ToastViewport() {
  const [current, setCurrent] = useState<ToastItem[]>(items);

  useEffect(() => {
    const listener: Listener = (next) => setCurrent(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="pointer-events-none fixed bottom-28 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence>
        {current.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl border border-purple-300/25 bg-[#0d0f12]/95 px-4 py-2 text-sm text-white shadow-2xl shadow-black/50 backdrop-blur-xl"
          >
            {item.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
