import { Users } from "lucide-react";
import { mockFriends } from "../../data/mockUsers";
import { NoctraWindow } from "./NoctraWindow";

const statusClass = {
  online: "bg-emerald-400",
  idle: "bg-yellow-300",
  offline: "bg-zinc-500",
};

export function FriendsWindow() {
  return (
    <NoctraWindow title="Friends" icon={<Users size={17} />}>
      <div className="space-y-3">
        {mockFriends.map((friend) => (
          <div
            key={friend.id}
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
          >
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-500/15 font-semibold">
                {friend.name[0]}
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border border-black ${
                    statusClass[friend.status]
                  }`}
                />
              </div>

              <div>
                <p className="text-sm font-medium text-white">{friend.name}</p>
                <p className="text-xs capitalize text-purple-100/45">
                  {friend.status}
                </p>
              </div>
            </div>

            {friend.listeningTo && (
              <p className="mt-3 rounded-xl bg-black/20 px-3 py-2 text-xs text-purple-100/55">
                listening to {friend.listeningTo}
              </p>
            )}
          </div>
        ))}
      </div>
    </NoctraWindow>
  );
}