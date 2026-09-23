# Noctra backend: Node.js/Express (Telegram audio proxy).
#
# ВАЖНО: этот образ запускает именно `node index.js`, а не статику.
# Раньше Fly.io пытался собрать проект как статический сайт (используя
# root-конфиг Vite), из-за чего сервер не стартовал и весь /api отдавал 404.

FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app

# Манифесты копируем отдельно от кода: пока они не менялись, слой с
# зависимостями берётся из кэша и сборка идёт секунды.
#
# `npm ci` в этом репозитории падает: корневой и серверный package-lock
# содержат ссылки на приватный registry, недоступный из сборки. Поэтому
# ставим только прод-зависимости обычным `npm install`.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

# Каталог для кэша треков (data/telegram-tracks.json).
#
# Ограничение Fly.io: корневая ФС контейнера эфемерна и стирается при каждом
# деплое/рестарте. Чтобы кэш пережил перезапуск, сюда монтируется volume —
# тогда путь совпадёт с `process.cwd()/data`, который ждёт index.js.
# Без volume сервер просто пересоберёт кэш из Telegram при старте.
RUN mkdir -p /app/data && chown -R node:node /app

# Не работаем под root: минимальные привилегии внутри контейнера.
USER node

# Fly передаёт порт через $PORT, index.js уже читает его (fallback 3001).
ENV PORT=8080
EXPOSE 8080

# Проверка живости: /api/health объявлен в index.js и не требует токена бота,
# поэтому контейнер не помечается «больным» из-за внешних зависимостей.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "index.js"]
