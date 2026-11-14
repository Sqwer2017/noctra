import homeShot from '../assets/media/home.webp'
import discoveryShot from '../assets/media/discovery.webp'
import profileShot from '../assets/media/profile.webp'
import lyricsShot from '../assets/media/lyrics.webp'
import playerShot from '../assets/media/player.webp'
import spotifyLogo from '../assets/media/spotify.png'
import appleMusicLogo from '../assets/media/apple-music.png'
import youtubeMusicLogo from '../assets/media/youtube-music.png'
import soundcloudLogo from '../assets/media/soundcloud.png'
import deezerLogo from '../assets/media/deezer.png'
import playMusicLogo from '../assets/media/play-music.png'

export const REPO_URL = 'https://github.com/Sqwer2017/noctra'
export const PROFILE_URL = 'https://github.com/Sqwer2017'
export const SOCIALS = [
  {
    id: 'telegram',
    name: 'Telegram',
    handle: '@noctraEU',
    href: 'https://t.me/noctraEU',
    description: 'Новости, беты и релизы',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    handle: '@noctraeu',
    href: 'https://www.tiktok.com/@noctraeu',
    description: 'Короткие видео и превью',
  },
  {
    id: 'github',
    name: 'GitHub',
    handle: 'Sqwer2017',
    href: PROFILE_URL,
    description: 'Исходники, релизы и issues',
  },
]
export const RELEASES_URL = 'https://github.com/Sqwer2017/noctra/releases'
export const ISSUES_URL = 'https://github.com/Sqwer2017/noctra/issues'
export const ANDROID_RELEASES_URL = 'https://github.com/Sqwer2017/noctra-android/releases'
export const ANDROID_APK_URL =
  'https://github.com/Sqwer2017/noctra-android/releases/download/android-latest/Noctra-debug.apk'
export const SOURCE_URL = 'https://github.com/Sqwer2017/noctra/blob/main/README.ru.md#-сборка-из-исходников'
export const LICENSE_URL = 'https://github.com/Sqwer2017/noctra/blob/main/LICENSE'
export const PRIVACY_URL = 'https://github.com/Sqwer2017/noctra/blob/main/PRIVACY.md'
export const NOTICE_URL = 'https://github.com/Sqwer2017/noctra/blob/main/NOTICE'

export const platforms = [
  { id: 'spotify', name: 'Spotify', logo: spotifyLogo },
  { id: 'apple-music', name: 'Apple Music', logo: appleMusicLogo },
  { id: 'youtube-music', name: 'YouTube Music', logo: youtubeMusicLogo },
  { id: 'soundcloud', name: 'SoundCloud', logo: soundcloudLogo },
  { id: 'deezer', name: 'Deezer', logo: deezerLogo },
  { id: 'play-music', name: 'Play Music', logo: playMusicLogo },
]

export const sourcePlatforms = platforms.filter((platform) =>
  ['apple-music', 'youtube-music', 'soundcloud', 'deezer'].includes(platform.id),
)

export const screenshots = [
  {
    id: 'home',
    label: 'Главная',
    title: 'Только твоя музыка',
    caption: 'Подборки, недавние треки и любимые артисты в одном спокойном пространстве.',
    image: homeShot,
    alt: 'Главный экран Noctra с подборками и недавними треками',
  },
  {
    id: 'discovery',
    label: 'Открытие дня',
    title: 'Новое каждый день',
    caption: 'Случайный артист, его треки и быстрый переход в профиль.',
    image: discoveryShot,
    alt: 'Экран открытия дня в Noctra с карточкой артиста',
  },
  {
    id: 'profile',
    label: 'Профиль',
    title: 'Прогресс, который твой',
    caption: 'Уровень, достижения и статистика считаются локально. Это не соцсеть.',
    image: profileShot,
    alt: 'Профиль слушателя в Noctra с уровнем и статистикой',
  },
  {
    id: 'lyrics',
    label: 'Тексты',
    title: 'Слова на своём месте',
    caption: 'Синхронные тексты, перевод и полноэкранный режим для караоке.',
    image: lyricsShot,
    alt: 'Экран текста песни в Noctra с подсветкой текущей строки',
  },
  {
    id: 'player',
    label: 'Плеер',
    title: 'Только музыка',
    caption: 'Большая обложка, мягкий фон и ничего, что отвлекает.',
    image: playerShot,
    alt: 'Полноэкранный плеер Noctra с обложкой трека',
  },
]

export const features = [
  {
    id: 'search',
    icon: 'search',
    wide: true,
    title: 'Один поиск — все источники',
    text: 'YouTube, YouTube Music, SoundCloud, Deezer, Apple Music и папки на диске. Меняй источник, не меняя плеер.',
  },
  {
    id: 'lyrics',
    icon: 'lyrics',
    title: 'Тексты, которые поют с тобой',
    text: 'Синхронный LRC, перевод, караоке и полноэкранный режим.',
  },
  {
    id: 'profile',
    icon: 'sparkle',
    title: 'Профиль без соцсети',
    text: 'XP, ранги, достижения и статистика для тебя. Всё считается на устройстве.',
  },
  {
    id: 'sound',
    icon: 'eq',
    title: 'Звук под тебя',
    text: 'Эквалайзер, темп, тональность, реверберация и перегрузка.',
  },
  {
    id: 'privacy',
    icon: 'shield',
    title: 'Локально по умолчанию',
    text: 'Ни рекламы, ни телеметрии. История, настройки и библиотека остаются у тебя.',
  },
  {
    id: 'moods',
    icon: 'moon',
    wide: true,
    title: 'Два характера главной',
    text: 'Карусель для фокуса на треке или Home для открытий. Переключается одним касанием.',
  },
]

export const faqs = [
  {
    q: 'Noctra бесплатная?',
    a: 'Да. Плеер бесплатный, без подписки и рекламы. Код открыт и распространяется по лицензии MIT.',
  },
  {
    q: 'Нужен аккаунт?',
    a: 'Нет. Noctra не просит регистрацию и не привязывает библиотеку к облаку. Всё хранится на твоём устройстве.',
  },
  {
    q: 'Откуда в приложении музыка?',
    a: 'Noctra работает с твоими источниками: YouTube, YouTube Music, SoundCloud, Deezer, Apple Music и локальными файлами. Приложение не хостит и не раздаёт музыку.',
  },
  {
    q: 'Почему Windows предупреждает при установке?',
    a: 'Сборка пока без коммерческой подписи, поэтому SmartScreen может попросить подтверждение. Исходный код и релиз открыты для проверки.',
  },
  {
    q: 'Как установить APK на Android?',
    a: 'Скачай APK, открой файл и разреши установку из этого источника. Сейчас доступна бета-сборка; обновления приходят вместе с новыми релизами.',
  },
  {
    q: 'Куда уходят мои данные?',
    a: 'Никуда. Нет телеметрии, рекламы и облачного профиля. Настройки, история и локальные плейлисты остаются у тебя.',
  },
]

export const tourSteps = [
  {
    id: 'download',
    selector: '[data-tour="hero-download"]',
    title: 'Скачать — одной кнопкой',
    text: 'Мы определяем систему и подставляем нужный файл. На Windows это установщик, на Android — APK.',
  },
  {
    id: 'sources',
    selector: '[data-tour="sources"]',
    title: 'Твои источники',
    text: 'YouTube Music, SoundCloud, Deezer, Apple Music и локальные файлы живут в одном окне.',
  },
  {
    id: 'gallery',
    selector: '[data-tour="screens"]',
    title: 'Загляни внутрь',
    text: 'Переключай экраны и открывай снимки на весь размер. Интерфейс можно рассмотреть до установки.',
  },
  {
    id: 'mood',
    selector: '[data-tour="mood"]',
    title: 'Настрой под себя',
    text: 'Акцент и атмосфера меняются сразу и запоминаются. Выбор можно изменить в любой момент.',
  },
  {
    id: 'final',
    selector: '[data-tour="download"]',
    title: 'Всё готово',
    text: 'Кнопка ниже скачает подходящую версию. Спасибо, что заглянул в Noctra.',
  },
]

export const navLinks = [
  { href: '#features', label: 'Возможности' },
  { href: '#screens', label: 'Интерфейс' },
  { href: '#mood', label: 'Настроение' },
  { href: '#download', label: 'Скачать' },
  { href: '#faq', label: 'FAQ' },
]

export const tickerPhrases = [
  { text: 'Твоя музыка', em: true },
  { text: 'Без рекламы' },
  { text: 'Твои правила', em: true },
  { text: 'Без аккаунта' },
  { text: 'Local-first' },
  { text: 'Open source' },
  { text: '6 источников' },
]

export const principles = [
  { value: 6, label: 'источников', note: 'в одном поиске' },
  { value: 0, label: 'рекламы и телеметрии', note: 'ни одного запроса' },
  { value: 100, suffix: '%', label: 'локально', note: 'твои данные' },
  { text: 'MIT', label: 'open source', note: 'без подписок' },
]

