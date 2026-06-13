import { Crown, UserRound } from "lucide-react";
import { profileUser } from "../../data/mockUsers";
import { NoctraWindow } from "./NoctraWindow";

export function ProfileWindow() {
  return (
    <NoctraWindow title="Profile" icon={<UserRound size={17} />}>
      <div className="space-y-4">
        <div className="h-28 rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.55),rgba(30,20,45,0.9))]" />

        <div className="-mt-12 flex items-end gap-4 px-3">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl border border-purple-200/25 bg-black/45 text-2xl font-bold shadow-xl shadow-purple-950/40">
            M
          </div>

          <div className="pb-2">
            <h3 className="text-xl font-bold text-white">
              {profileUser.username}
            </h3>
            <p className="text-sm text-purple-100/50">{profileUser.handle}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <div className="mb-2 flex items-center gap-2 text-sm text-purple-100">
            <Crown size={16} />
            {profileUser.rank}
          </div>
          <p className="text-sm text-purple-100/65">{profileUser.bio}</p>
          <p className="mt-3 text-xs text-purple-200/45">
            “{profileUser.status}”
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-lg font-semibold">{profileUser.followers}</p>
            <p className="text-xs text-purple-100/45">followers</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <p className="text-lg font-semibold">{profileUser.following}</p>
            <p className="text-xs text-purple-100/45">following</p>
          </div>
        </div>
      </div>
    </NoctraWindow>
  );
}