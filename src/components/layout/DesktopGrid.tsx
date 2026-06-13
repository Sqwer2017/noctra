import type { AppPage } from "./AppShell";

import {
  Bot,
  Crown,
  ListMusic,
  Music,
  Palette,
  Play,
  Plus,
  Search,
  User,
  Users,
} from "lucide-react";

import { NoctraWindow } from "../ui/NoctraWindow";

const tracks = [
  ["Eclipse of the Fallen", "Nyxshade", "SoundCloud", "3:42"],
  ["Bloodmoon Overture", "GravePulse", "Audius", "4:12"],
  ["Beyond the Veil", "Lunaris", "Telegram Test", "2:58"],
  ["Requiem of Embers", "Vexra", "SoundCloud", "3:27"],
];

const playlists = [
  ["Dark Sovereigns", "Cinematic tracks for boss fights.", "42 tracks"],
  ["Night Drive", "Slow ambient tracks for midnight sessions.", "28 tracks"],
  ["Arcane Focus", "Mystical background music for coding.", "19 tracks"],
];

const friends = [
  ["Nyxshade", "listening to Eclipse of the Fallen", "bg-emerald-400"],
  ["Lunaris", "editing profile theme", "bg-yellow-300"],
  ["Svaria", "last seen 2h ago", "bg-zinc-500"],
];

type DesktopGridProps = {
  activePage: AppPage;
};

export function DesktopGrid({ activePage }: DesktopGridProps) {
  if (activePage === "Music") return <MusicPage />;
  if (activePage === "Profile") return <ProfilePage />;
  if (activePage === "Customize") return <CustomizePage />;
  if (activePage === "Friends") return <FriendsPage />;
  if (activePage === "Chat") return <ChatPage />;
  if (activePage === "Settings") return <SettingsPage />;
  return (
    <div className="grid min-h-0 grid-cols-[340px_1fr_460px] grid-rows-[1fr_300px] gap-4">
      <div className="grid min-h-0 grid-rows-[1fr_300px] gap-4">
        <NoctraWindow
          title="Profile"
          subtitle="identity module"
          icon={<User size={17} />}
        >
          <ProfileModule />
        </NoctraWindow>

        <NoctraWindow
          title="Playlists"
          subtitle="personal collections"
          icon={<ListMusic size={17} />}
        >
          <PlaylistsModule />
        </NoctraWindow>
      </div>

      <div className="grid min-h-0 grid-rows-[1fr_300px] gap-4">
        <NoctraWindow
          title="Music Source"
          subtitle="SoundCloud / Audius / Telegram"
          icon={<Music size={17} />}
        >
          <MusicModule />
        </NoctraWindow>

        <NoctraWindow
          title="Customization"
          subtitle="profile window manager"
          icon={<Palette size={17} />}
        >
          <CustomizationModule />
        </NoctraWindow>
      </div>

      <div className="grid min-h-0 grid-rows-[1fr_300px] gap-4">
        <NoctraWindow
          title="Friends"
          subtitle="social activity"
          icon={<Users size={17} />}
        >
          <FriendsModule />
        </NoctraWindow>

        <NoctraWindow
          title="Telegram Lab"
          subtitle="experimental integration"
          icon={<Bot size={17} />}
        >
          <TelegramModule />
        </NoctraWindow>
      </div>
    </div>
  );
}

function ProfileModule() {
  return (
    <div className="space-y-4">
      <div className="h-24 rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.5),rgba(30,20,45,0.9))]" />

      <div className="-mt-10 flex items-end gap-4 px-2">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-purple-200/25 bg-black/70 text-2xl font-bold shadow-xl shadow-purple-950/40">
          M
        </div>

        <div className="pb-2">
          <h3 className="text-xl font-bold">Mocevn</h3>
          <p className="text-sm text-purple-100/45">@mocevn</p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
        <div className="mb-2 flex items-center gap-2 text-sm text-purple-100">
          <Crown size={16} />
          Nightborn
        </div>

        <p className="text-sm leading-5 text-purple-100/65">
          Dark fantasy enjoyer, playlist collector, and late-night gamer.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Followers" value="1.2K" />
        <Stat label="Playlists" value="18" />
      </div>
    </div>
  );
}

function MusicModule() {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-purple-100/45">
        <Search size={16} />
        Search SoundCloud, Audius, Telegram Test...
      </div>

      <div className="flex gap-2">
        {["SoundCloud", "Audius", "Telegram Test"].map((source) => (
          <button
            key={source}
            className="rounded-full border border-purple-300/15 bg-purple-500/10 px-3 py-1 text-xs text-purple-100/60"
          >
            {source}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1 noctra-scrollbar">
        {tracks.map(([title, artist, source, time]) => (
          <div
            key={title}
            className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 transition hover:bg-white/[0.07]"
          >
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500/40 to-black" />

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">
                {title}
              </p>
              <p className="text-xs text-purple-100/45">
                {artist} · {source}
              </p>
            </div>

            <span className="text-xs text-purple-100/35">{time}</span>

            <button className="rounded-full bg-purple-500/25 p-2 text-white transition hover:bg-purple-500/40">
              <Play size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlaylistsModule() {
  return (
    <div className="flex h-full flex-col gap-3">
      <button className="flex items-center justify-center gap-2 rounded-2xl border border-purple-300/20 bg-purple-500/15 px-4 py-3 text-sm text-purple-50 transition hover:bg-purple-500/25">
        <Plus size={16} />
        Create playlist
      </button>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1 noctra-scrollbar">
        {playlists.map(([name, description, count]) => (
          <div
            key={name}
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
          >
            <h3 className="text-sm font-semibold">{name}</h3>
            <p className="mt-1 text-xs leading-5 text-purple-100/45">
              {description}
            </p>
            <p className="mt-2 text-xs text-purple-200/45">{count}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function FriendsModule() {
  return (
    <div className="space-y-3">
      {friends.map(([name, activity, statusColor]) => (
        <div
          key={name}
          className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 transition hover:bg-white/[0.07]"
        >
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-500/20 font-semibold">
              {name[0]}

              <span
                className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border border-black ${statusColor}`}
              />
            </div>

            <div>
              <p className="text-sm font-semibold">{name}</p>
              <p className="text-xs text-purple-100/45">{activity}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CustomizationModule() {
  return (
    <div className="grid h-full grid-cols-3 gap-3">
      <Panel title="Accent color">
        <div className="flex gap-2">
          {["bg-purple-500", "bg-blue-500", "bg-pink-500", "bg-red-500"].map(
            (color) => (
              <button
                key={color}
                className={`h-7 w-7 rounded-full border border-white/20 ${color}`}
              />
            ),
          )}
        </div>
      </Panel>

      <Panel title="Widgets">
        <div className="space-y-2 text-xs text-purple-100/55">
          <Toggle label="Favorite tracks" />
          <Toggle label="Friend activity" />
          <Toggle label="Telegram feed" />
        </div>
      </Panel>

      <Panel title="Layout preset">
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((item) => (
            <button
              key={item}
              className="h-14 rounded-xl border border-purple-300/15 bg-purple-500/10"
            />
          ))}
        </div>
      </Panel>
    </div>
  );
}

function TelegramModule() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-yellow-300/20 bg-yellow-400/10 p-4">
        <p className="text-sm font-semibold text-yellow-100">
          Experimental integration
        </p>

        <p className="mt-2 text-xs leading-5 text-yellow-100/55">
          Telegram is planned for test chat, notifications and music feed. Bot
          tokens must stay on backend.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Bot status" value="Mock" />
        <Stat label="Mode" value="Test" />
      </div>

      <input
        placeholder="Paste Telegram channel link..."
        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none placeholder:text-purple-100/35 focus:border-purple-300/40"
      />

      <button className="w-full rounded-2xl border border-purple-300/20 bg-purple-500/15 px-4 py-3 text-sm transition hover:bg-purple-500/25">
        Import test feed
      </button>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-purple-100/45">
        {title}
      </p>

      {children}
    </div>
  );
}

function Toggle({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className="h-5 w-9 rounded-full bg-purple-500/30 p-0.5">
        <span className="block h-4 w-4 rounded-full bg-purple-200" />
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <p className="text-xs text-purple-100/40">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function MusicPage() {
  return (
    <div className="grid min-h-0 grid-cols-[1fr_360px] gap-4">
      <NoctraWindow
        title="Music Library"
        subtitle="full discovery workspace"
        icon={<Music size={17} />}
      >
        <MusicModule />
      </NoctraWindow>

      <NoctraWindow
        title="Sources"
        subtitle="API placeholders"
        icon={<Bot size={17} />}
      >
        <TelegramModule />
      </NoctraWindow>
    </div>
  );
}

function ProfilePage() {
  return (
    <div className="grid min-h-0 grid-cols-[420px_1fr] gap-4">
      <NoctraWindow
        title="Public Profile"
        subtitle="profile preview"
        icon={<User size={17} />}
      >
        <ProfileModule />
      </NoctraWindow>

      <NoctraWindow
        title="Profile Showcase"
        subtitle="favorite tracks and widgets"
        icon={<Music size={17} />}
      >
        <MusicModule />
      </NoctraWindow>
    </div>
  );
}

function CustomizePage() {
  return (
    <div className="grid min-h-0 grid-cols-[1fr_420px] gap-4">
      <NoctraWindow
        title="Customization Studio"
        subtitle="themes, widgets and layout"
        icon={<Palette size={17} />}
      >
        <CustomizationModule />
      </NoctraWindow>

      <NoctraWindow
        title="Live Profile Preview"
        subtitle="how your profile will look"
        icon={<User size={17} />}
      >
        <ProfileModule />
      </NoctraWindow>
    </div>
  );
}

function FriendsPage() {
  return (
    <div className="grid min-h-0 grid-cols-[420px_1fr] gap-4">
      <NoctraWindow
        title="Friends"
        subtitle="online status and activity"
        icon={<Users size={17} />}
      >
        <FriendsModule />
      </NoctraWindow>

      <NoctraWindow
        title="Friend Music Activity"
        subtitle="what your guild listens to"
        icon={<Music size={17} />}
      >
        <MusicModule />
      </NoctraWindow>
    </div>
  );
}

function ChatPage() {
  return (
    <div className="grid min-h-0 grid-cols-[1fr_420px] gap-4">
      <NoctraWindow
        title="Noctra Chat"
        subtitle="test messaging UI"
        icon={<Users size={17} />}
      >
        <div className="flex h-full flex-col gap-3">
          {[
            "This profile theme looks insane.",
            "Need to add music sync next.",
            "Telegram bot could send activity notifications.",
          ].map((message) => (
            <div
              key={message}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-purple-100/70"
            >
              {message}
            </div>
          ))}

          <div className="mt-auto flex gap-2 rounded-2xl border border-white/10 bg-black/30 p-2">
            <input
              placeholder="Send a test message..."
              className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-purple-100/35"
            />
            <button className="rounded-xl bg-purple-500/25 px-4 text-sm">
              Send
            </button>
          </div>
        </div>
      </NoctraWindow>

      <NoctraWindow
        title="Telegram Lab"
        subtitle="future bot sync"
        icon={<Bot size={17} />}
      >
        <TelegramModule />
      </NoctraWindow>
    </div>
  );
}

function SettingsPage() {
  return (
    <div className="grid min-h-0 grid-cols-3 gap-4">
      <NoctraWindow
        title="Account"
        subtitle="profile and privacy"
        icon={<User size={17} />}
      >
        <Panel title="Account status">
          <p className="text-sm text-purple-100/60">Local MVP account</p>
        </Panel>
      </NoctraWindow>

      <NoctraWindow
        title="Music Sources"
        subtitle="future API integrations"
        icon={<Music size={17} />}
      >
        <div className="space-y-3">
          {["SoundCloud", "Audius", "Telegram Bot"].map((source) => (
            <div
              key={source}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
            >
              <p className="text-sm font-semibold">{source}</p>
              <p className="mt-1 text-xs text-purple-100/45">
                Not connected yet. Must be connected through backend/serverless.
              </p>
            </div>
          ))}
        </div>
      </NoctraWindow>

      <NoctraWindow
        title="Danger Zone"
        subtitle="session controls"
        icon={<Bot size={17} />}
      >
        <Panel title="Security note">
          <p className="text-sm leading-6 text-purple-100/60">
            API keys and Telegram bot tokens must never be stored directly in
            frontend code.
          </p>
        </Panel>
      </NoctraWindow>
    </div>
  );
}