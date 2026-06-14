import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Readable } from "node:stream";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3001;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("Missing TELEGRAM_BOT_TOKEN in server/.env");
  process.exit(1);
}

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;
const TELEGRAM_FILE_API = `https://api.telegram.org/file/bot${BOT_TOKEN}`;

let lastUpdateId = 0;
let telegramTracks = [];

app.use(
  cors({
    origin: true,
    allowedHeaders: ["Content-Type", "Range"],
    exposedHeaders: [
      "Content-Type",
      "Content-Length",
      "Content-Range",
      "Accept-Ranges",
    ],
  }),
);
app.use(express.json());

function isAudioDocument(document) {
  if (!document) return false;

  const mimeType = document.mime_type ?? "";
  const fileName = document.file_name ?? "";

  return (
    mimeType.startsWith("audio/") ||
    /\.(mp3|wav|ogg|oga|m4a|aac|flac)$/i.test(fileName)
  );
}

function secondsToDuration(seconds) {
  if (!seconds || Number.isNaN(seconds)) return "0:00";

  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;

  return `${minutes}:${String(restSeconds).padStart(2, "0")}`;
}

function extractTrackFromMessage(message) {
  const audio = message.audio;
  const document = message.document;

  const file = audio || (isAudioDocument(document) ? document : null);

  if (!file) return null;

  const fileId = file.file_id;
  const uniqueId = file.file_unique_id ?? fileId;

  const thumbnail = audio?.thumbnail || document?.thumbnail || null;
  const thumbnailFileId = thumbnail?.file_id ?? null;

  const coverUrl = thumbnailFileId
    ? `http://localhost:${PORT}/api/telegram/file?fileId=${encodeURIComponent(
        thumbnailFileId,
      )}`
    : null;

  const title =
    audio?.title ||
    document?.file_name?.replace(/\.[^/.]+$/, "") ||
    message.caption ||
    "Telegram track";

  const artist = audio?.performer || "Telegram";

  const duration = audio?.duration
    ? secondsToDuration(audio.duration)
    : "0:00";

  return {
    id: `tg-${uniqueId}`,
    fileId,
    title,
    artist,
    thumbnailFileId,
    coverUrl,
    source: "Telegram",
    duration,
    streamUrl: `http://localhost:${PORT}/api/telegram/file?fileId=${encodeURIComponent(
      fileId,
    )}`,
  };
}

async function syncTelegramUpdates() {
  const updatesUrl = new URL(`${TELEGRAM_API}/getUpdates`);

  if (lastUpdateId > 0) {
    updatesUrl.searchParams.set("offset", String(lastUpdateId + 1));
  }

  updatesUrl.searchParams.set(
    "allowed_updates",
    JSON.stringify(["message", "channel_post", "edited_channel_post"]),
  );

  const response = await fetch(updatesUrl);

  if (!response.ok) {
    throw new Error(`Telegram getUpdates failed: ${response.status}`);
  }

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.description || "Telegram getUpdates error");
  }

  for (const update of data.result) {
    lastUpdateId = Math.max(lastUpdateId, update.update_id);

    const message =
      update.message || update.channel_post || update.edited_channel_post;
    
    console.log("Telegram update:", {
        updateId: update.update_id,
        type: update.message
          ? "message"
          : update.channel_post
            ? "channel_post"
            : update.edited_channel_post
              ? "edited_channel_post"
              : "unknown",
        chatTitle: message?.chat?.title,
        hasThumbnail: Boolean(message?.audio?.thumbnail || message?.document?.thumbnail),
        chatType: message?.chat?.type,
        hasAudio: Boolean(message?.audio),
        hasDocument: Boolean(message?.document),
      });

      if (!message) continue;

    const track = extractTrackFromMessage(message);
    if (!track) continue;

    const alreadyExists = telegramTracks.some((item) => item.id === track.id);

    if (!alreadyExists) {
      telegramTracks = [track, ...telegramTracks];
    }
  }

  return telegramTracks;
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "noctra-telegram-server",
  });
});

app.get("/api/telegram/tracks", async (req, res) => {
  res.json({
    ok: true,
    tracks: telegramTracks,
  });
});

app.post("/api/telegram/sync", async (req, res) => {
  try {
    const tracks = await syncTelegramUpdates();

    res.json({
      ok: true,
      tracks,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Unknown server error",
    });
  }
});

app.get("/api/telegram/file", async (req, res) => {
  try {
    const fileId = req.query.fileId;

    if (!fileId || typeof fileId !== "string") {
      return res.status(400).json({
        ok: false,
        message: "Missing fileId",
      });
    }

    const rangeHeader = req.headers.range;

    const fileInfoResponse = await fetch(
      `${TELEGRAM_API}/getFile?file_id=${encodeURIComponent(fileId)}`,
    );

    if (!fileInfoResponse.ok) {
      throw new Error(`Telegram getFile failed: ${fileInfoResponse.status}`);
    }

    const fileInfo = await fileInfoResponse.json();

    if (!fileInfo.ok) {
      throw new Error(fileInfo.description || "Telegram getFile error");
    }

    const filePath = fileInfo.result.file_path;
    const fileUrl = `${TELEGRAM_FILE_API}/${filePath}`;

    const telegramHeaders = {};

    if (rangeHeader) {
      telegramHeaders.Range = rangeHeader;
    }

    const fileResponse = await fetch(fileUrl, {
      headers: telegramHeaders,
    });

    if (!fileResponse.ok || !fileResponse.body) {
      throw new Error(`Telegram file download failed: ${fileResponse.status}`);
    }

    const contentType =
      fileResponse.headers.get("content-type") || "audio/mpeg";

    const contentLength = fileResponse.headers.get("content-length");
    const contentRange = fileResponse.headers.get("content-range");

    res.setHeader("Content-Type", contentType);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "no-store");

    if (rangeHeader && fileResponse.status === 206) {
      res.status(206);

      if (contentRange) {
        res.setHeader("Content-Range", contentRange);
      }

      if (contentLength) {
        res.setHeader("Content-Length", contentLength);
      }
    } else {
      res.status(fileResponse.status);

      if (contentLength) {
        res.setHeader("Content-Length", contentLength);
      }
    }

    Readable.fromWeb(fileResponse.body).pipe(res);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      ok: false,
      message: error instanceof Error ? error.message : "Unknown server error",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Noctra Telegram server running on http://localhost:${PORT}`);
});