import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  ANDROID_APK_URL,
  ANDROID_RELEASES_URL,
  RELEASES_URL,
  SOURCE_URL,
} from '../data/content'
import { useToast } from '../lib/toast'

const ReleasesContext = createContext(null)
const RELEASE_CACHE = 'noctra:latest-release'
const DOWNLOADS_KEY = 'noctra:downloads'
const FALLBACK_RELEASE = { tag: 'v0.1.0', exeUrl: null, size: null, publishedAt: null }

export const DEVICE_META = {
  windows: { label: 'Windows', icon: 'monitor', detail: 'Windows 10 / 11 · x64' },
  android: { label: 'Android', icon: 'smartphone', detail: 'Android · бета' },
  ios: { label: 'iPhone / iPad', icon: 'smartphone', detail: 'iOS · сборки пока нет' },
  macos: { label: 'macOS', icon: 'laptop', detail: 'macOS · экспериментально' },
  linux: { label: 'Linux', icon: 'terminal', detail: 'Linux · из исходников' },
  unknown: { label: 'Твоё устройство', icon: 'monitor', detail: 'Определяем систему' },
}

export function detectDevice() {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  const touch = navigator.maxTouchPoints > 1
  if (/Android/i.test(ua)) return 'android'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Macintosh/i.test(ua) && touch) return 'ios'
  if (/Windows|Win32|Win64/i.test(ua)) return 'windows'
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macos'
  if (/Linux/i.test(ua)) return 'linux'
  return 'unknown'
}

function buildTarget(id, release) {
  if (id === 'windows') {
    const direct = Boolean(release.exeUrl)
    return {
      id,
      label: 'Windows',
      icon: 'monitor',
      actionLabel: 'Скачать для Windows',
      sub: release.size ? `Установщик · ${formatSize(release.size)}` : 'Установщик · x64',
      href: direct ? release.exeUrl : RELEASES_URL,
      direct,
      external: !direct,
      status: direct ? 'Доступно' : 'GitHub',
      tone: direct ? 'live' : 'quiet',
    }
  }
  if (id === 'android') {
    return {
      id,
      label: 'Android',
      icon: 'smartphone',
      actionLabel: 'Скачать APK',
      sub: 'APK · бета',
      href: ANDROID_APK_URL,
      direct: true,
      external: false,
      status: 'Бета',
      tone: 'soft',
    }
  }
  if (id === 'ios') {
    return {
      id,
      label: 'iPhone / iPad',
      icon: 'smartphone',
      actionLabel: 'Скачать APK для Android',
      sub: 'iOS-сборки пока нет',
      href: ANDROID_APK_URL,
      direct: true,
      external: false,
      status: 'Только Android',
      tone: 'quiet',
      note: 'APK устанавливается на Android. Версия для iOS пока в работе.',
    }
  }
  if (id === 'macos') {
    return {
      id,
      label: 'macOS',
      icon: 'laptop',
      actionLabel: 'Открыть релизы',
      sub: 'DMG · экспериментально',
      href: RELEASES_URL,
      direct: false,
      external: true,
      status: 'Эксперимент',
      tone: 'quiet',
    }
  }
  return {
    id: 'linux',
    label: 'Linux',
    icon: 'terminal',
    actionLabel: 'Собрать из исходников',
    sub: 'AppImage пока нет',
    href: SOURCE_URL,
    direct: false,
    external: true,
    status: 'Исходники',
    tone: 'quiet',
  }
}

function formatSize(bytes) {
  if (!bytes) return ''
  const megabytes = Math.round(bytes / 1024 / 1024)
  return `${megabytes} МБ`
}

export function formatCount(value) {
  return new Intl.NumberFormat('ru-RU').format(Math.max(0, Math.round(value)))
}

function readCache() {
  try {
    const raw = window.sessionStorage.getItem(RELEASE_CACHE)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed.data || Date.now() - parsed.time > 30 * 60 * 1000) return null
    return parsed.data
  } catch {
    return null
  }
}

function useLatestRelease() {
  const [release, setRelease] = useState(() => readCache() ?? FALLBACK_RELEASE)
  const [loading, setLoading] = useState(!readCache())

  useEffect(() => {
    if (readCache()) {
      setLoading(false)
      return undefined
    }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 7000)

    fetch('https://api.github.com/repos/Sqwer2017/noctra/releases/latest', {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' },
    })
      .then((response) => {
        if (!response.ok) throw new Error(`GitHub responded ${response.status}`)
        return response.json()
      })
      .then((data) => {
        const asset = data.assets?.find((item) => /\.exe$/i.test(item.name) && !/\.blockmap$/i.test(item.name))
        const payload = {
          tag: data.tag_name || FALLBACK_RELEASE.tag,
          exeUrl: asset?.browser_download_url || null,
          size: asset?.size || null,
          publishedAt: data.published_at || null,
        }
        setRelease(payload)
        setLoading(false)
        try {
          window.sessionStorage.setItem(RELEASE_CACHE, JSON.stringify({ time: Date.now(), data: payload }))
        } catch {
          // Cache is optional.
        }
      })
      .catch(() => setLoading(false))
      .finally(() => window.clearTimeout(timeout))

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [])

  return { release, loading }
}

function readClicks() {
  try {
    const raw = window.localStorage.getItem(DOWNLOADS_KEY)
    const value = Number.parseInt(raw ?? '0', 10)
    return Number.isFinite(value) && value >= 0 ? value : 0
  } catch {
    return 0
  }
}

const listeners = new Set()
let localClicks = typeof window === 'undefined' ? 0 : readClicks()

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return localClicks
}

function registerDownload() {
  localClicks += 1
  try {
    window.localStorage.setItem(DOWNLOADS_KEY, String(localClicks))
  } catch {
    // A failed write still bumps the in-memory counter for this session.
  }
  listeners.forEach((listener) => listener())
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== DOWNLOADS_KEY) return
    localClicks = readClicks()
    listeners.forEach((listener) => listener())
  })
}

// Simulated baseline until the site gets a real download endpoint.
const COUNTER_BASE = 13

function simulatedDownloads() {
  return COUNTER_BASE
}

function useDownloadCount() {
  const clicks = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return useMemo(
    () => ({ count: simulatedDownloads() + clicks, register: registerDownload }),
    [clicks],
  )
}

export function DownloadsProvider({ children }) {
  const device = useMemo(() => detectDevice(), [])
  const { release, loading } = useLatestRelease()
  const toast = useToast()

  const targets = useMemo(() => ['windows', 'android', 'linux', 'macos'].map((id) => buildTarget(id, release)), [release])
  const primary = useMemo(() => {
    if (device === 'ios') return buildTarget('ios', release)
    return targets.find((target) => target.id === device) ?? targets[0]
  }, [device, release, targets])
  const deviceMeta = DEVICE_META[device] ?? DEVICE_META.unknown
  const { count, register } = useDownloadCount()

  const start = useCallback(
    (target = primary) => {
      if (target.direct) {
        register()
        if (target.id === 'android') {
          toast({ title: 'Загрузка началась', text: 'APK для Android. Спасибо, что слушаешь Noctra.' })
        } else if (target.id === 'ios') {
          toast({ title: 'Скачиваем APK', text: 'Файл подойдёт для Android. iOS-версия пока в работе.' })
        } else {
          toast({ title: 'Загрузка началась', text: `Установщик Noctra ${release.tag}.` })
        }
        return
      }

      if (target.id === 'linux') {
        toast({ title: 'Открываем исходники', text: 'Инструкция по сборке откроется на GitHub.' })
      } else if (target.id === 'android') {
        toast({ title: 'Открываем релизы', text: 'APK доступен на GitHub.' })
      } else {
        toast({ title: 'Открываем GitHub', text: 'Свежие сборки и исходный код Noctra.' })
      }
    },
    [primary, register, release.tag, toast],
  )

  const value = useMemo(
    () => ({
      device,
      deviceMeta,
      primary,
      targets,
      release,
      loading,
      count,
      start,
      androidReleasesUrl: ANDROID_RELEASES_URL,
    }),
    [device, deviceMeta, primary, targets, release, loading, count, start],
  )

  return <ReleasesContext.Provider value={value}>{children}</ReleasesContext.Provider>
}

export function useDownloads() {
  const context = useContext(ReleasesContext)
  if (!context) throw new Error('useDownloads must be used inside DownloadsProvider')
  return context
}
