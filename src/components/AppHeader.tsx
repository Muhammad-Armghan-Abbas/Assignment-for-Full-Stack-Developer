"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@/lib/auth";
import { api } from "@/lib/client";
import { Avatar } from "./Avatar";

export function AppHeader({ user, children }: { user: User; children?: React.ReactNode }) {
  const router = useRouter();
  async function signOut() {
    await api("/api/session", { method: "DELETE" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }
  return (
    <header className="app-header">
      <Link href="/documents" className="brand" title="All documents">
        <span className="brand-mark">A</span>
        <span className="brand-name">Ajaia Docs</span>
      </Link>
      <div className="app-header-middle">{children}</div>
      <div className="user-chip">
        <Avatar name={user.name} color={user.color} size={30} />
        <div className="user-chip-text">
          <span>{user.name}</span>
          <button className="link-button small" onClick={signOut}>
            Switch user
          </button>
        </div>
      </div>
    </header>
  );
}
