import { ChatWindow } from "../windows/ChatWindow";
import { FriendsWindow } from "../windows/FriendsWindow";
import { MusicWindow } from "../windows/MusicWindow";
import { PlaylistsWindow } from "../windows/PlaylistsWindow";
import { ProfileWindow } from "../windows/ProfileWindow";
import { TelegramLabWindow } from "../windows/TelegramLabWindow";

export function DesktopArea() {
  return (
    <section className="min-h-0 flex-1 p-4">
      <div className="grid h-full grid-cols-12 grid-rows-12 gap-4">
        <div className="col-span-3 row-span-7">
          <ProfileWindow />
        </div>

        <div className="col-span-5 row-span-7">
          <MusicWindow />
        </div>

        <div className="col-span-4 row-span-5">
          <FriendsWindow />
        </div>

        <div className="col-span-3 row-span-5">
          <PlaylistsWindow />
        </div>

        <div className="col-span-5 row-span-5">
          <ChatWindow />
        </div>

        <div className="col-span-4 row-span-7">
          <TelegramLabWindow />
        </div>
      </div>
    </section>
  );
}