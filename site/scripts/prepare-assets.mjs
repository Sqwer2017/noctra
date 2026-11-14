import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = process.env.NOCTRA_SCREENSHOTS || 'C:\\dev\\Screenshots for the video'
const mediaDir = path.join(root, 'src', 'assets', 'media')
const publicDir = path.join(root, 'public')

const shots = [
  ['Снимок экрана 2026-11-13 025023.png', 'home'],
  ['Снимок экрана 2026-11-13 025033.png', 'discovery'],
  ['Снимок экрана 2026-11-13 025157.png', 'profile'],
  ['Снимок экрана 2026-11-13 025142.png', 'lyrics'],
  ['Снимок экрана 2026-11-13 025325.png', 'player'],
]

const platforms = [
  ['spotify logo.png', 'spotify'],
  ['icons8-apple-music-96.png', 'apple-music'],
  ['YouTubeMusic_Logo.png', 'youtube-music'],
  ['Soundcloud logo.png', 'soundcloud'],
  ['deezer.png', 'deezer'],
  ['free-png.ru-60.png', 'play-music'],
]

await fs.mkdir(mediaDir, { recursive: true })
await fs.mkdir(publicDir, { recursive: true })

for (const [fileName, name] of shots) {
  const source = path.join(sourceDir, fileName)
  await sharp(source)
    .resize({ width: 1800, withoutEnlargement: true })
    .webp({ quality: 82, effort: 5 })
    .toFile(path.join(mediaDir, `${name}.webp`))
  console.log(`screenshot ${name}`)
}

for (const [fileName, name] of platforms) {
  const source = path.join(sourceDir, fileName)
  await sharp(source)
    .ensureAlpha()
    .trim({ threshold: 8 })
    .resize({ height: 160, withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toFile(path.join(mediaDir, `${name}.png`))
  console.log(`platform ${name}`)
}

const logoSrc = path.join(sourceDir, 'noctra-logo-transparent.png')
const logoBuffer = await sharp(logoSrc).resize({ height: 512, fit: 'inside' }).png().toBuffer()
await fs.writeFile(path.join(mediaDir, 'noctra-logo.png'), logoBuffer)

const tileSize = 512
const tile = await sharp({
  create: {
    width: tileSize,
    height: tileSize,
    channels: 4,
    background: '#f3efe7',
  },
})
  .composite([
    {
      input: await sharp(logoBuffer).resize({ height: 372 }).png().toBuffer(),
      gravity: 'center',
    },
  ])
  .png()
  .toBuffer()

await sharp(tile).resize(512, 512).toFile(path.join(publicDir, 'icon-512.png'))
await sharp(tile).resize(180, 180).toFile(path.join(publicDir, 'apple-touch-icon.png'))
await sharp(tile).resize(64, 64).toFile(path.join(publicDir, 'favicon.png'))

const tileMask = Buffer.from(
  `<svg width="${tileSize}" height="${tileSize}" xmlns="http://www.w3.org/2000/svg"><rect width="${tileSize}" height="${tileSize}" rx="${Math.round(tileSize * 0.27)}" fill="#fff"/></svg>`,
)
const roundedTile = await sharp(tile)
  .composite([{ input: tileMask, blend: 'dest-in' }])
  .png()
  .toBuffer()

const iconForOg = await sharp(roundedTile).resize(112, 112).png().toBuffer()

const ogSvg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="a" cx="18%" cy="0%" r="80%">
      <stop offset="0%" stop-color="#2a2138" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#08070b" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="b" cx="92%" cy="20%" r="60%">
      <stop offset="0%" stop-color="#38263a" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="#08070b" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="line" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#f3efe7" stop-opacity="0"/>
      <stop offset="50%" stop-color="#f3efe7" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#f3efe7" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#08070b"/>
  <rect width="1200" height="630" fill="url(#a)"/>
  <rect width="1200" height="630" fill="url(#b)"/>
  <circle cx="930" cy="80" r="320" fill="none" stroke="#f3efe7" stroke-opacity="0.06"/>
  <circle cx="930" cy="80" r="440" fill="none" stroke="#f3efe7" stroke-opacity="0.04"/>
  <rect x="1" y="1" width="1198" height="628" fill="none" stroke="#f3efe7" stroke-opacity="0.08"/>
  <text x="1080" y="128" text-anchor="end" font-family="Segoe UI, Arial, sans-serif" font-size="21" fill="#a9a2b5" letter-spacing="3">OPEN SOURCE · MIT</text>
  <text x="96" y="350" font-family="Segoe UI, Arial, sans-serif" font-size="92" font-weight="600" fill="#f3efe7" letter-spacing="-4">Noctra</text>
  <text x="96" y="416" font-family="Segoe UI, Arial, sans-serif" font-size="34" fill="#b9b2c4">Музыка, которая остаётся твоей.</text>
  <text x="96" y="474" font-family="Segoe UI, Arial, sans-serif" font-size="23" fill="#8f879b">Независимый музыкальный плеер для Windows и Android</text>
  <rect x="96" y="536" width="1008" height="1" fill="url(#line)"/>
  <text x="96" y="584" font-family="Segoe UI, Arial, sans-serif" font-size="20" fill="#7f788c">YouTube Music · SoundCloud · Deezer · Apple Music · локальные файлы</text>
  <text x="1104" y="584" text-anchor="end" font-family="Segoe UI, Arial, sans-serif" font-size="20" fill="#7f788c">v0.1.0</text>
</svg>`

await sharp(Buffer.from(ogSvg))
  .composite([{ input: iconForOg, left: 96, top: 88 }])
  .png({ compressionLevel: 9 })
  .toFile(path.join(publicDir, 'og.png'))

console.log('og image')
