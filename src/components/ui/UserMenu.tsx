"use client";

import { LogOut, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import type { User } from "@/lib/auth";
import { api } from "@/lib/client";
import { Avatar } from "./Avatar";
import { usePopover } from "./usePopover";

export function UserMenu({ user }: { user: User }) {
  const router = useRouter();
  const { open, toggle, ref } = usePopover();
  async function signOut() {
    await api("/api/session", { method: "DELETE" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }
  return (
    <div className="menu" ref={ref}>
      <button className="avatar-btn" onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-label={`Account: ${user.name}`}>
        <Avatar name={user.name} color={user.color} src={user.avatarUrl} size={34} />
      </button>
      {open && (
        <div className="menu-list menu-right" role="menu">
          <div className="menu-header">
            <Avatar name={user.name} color={user.color} src={user.avatarUrl} size={36} />
            <div>
              <strong>{user.name}</strong>
              <span className="muted small">{user.email}</span>
            </div>
          </div>
          <button role="menuitem" onClick={signOut}>
            <Users size={16} /> Switch user
          </button>
          <button role="menuitem" onClick={signOut}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
