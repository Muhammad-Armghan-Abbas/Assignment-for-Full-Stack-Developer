"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import type { User } from "@/lib/auth";
import { Avatar } from "./Avatar";

export function LoginPicker({ users, currentUserId }: { users: User[]; currentUserId: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(userId: string) {
    setBusy(userId);
    setError(null);
    try {
      await api("/api/session", { method: "POST", body: JSON.stringify({ userId }) });
      router.push("/documents");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <>
      <ul className="user-list">
        {users.map((u) => (
          <li key={u.id}>
            <button className="user-option" onClick={() => signIn(u.id)} disabled={busy !== null}>
              <Avatar name={u.name} color={u.color} />
              <span>
                <strong>{u.name}</strong>
                <span className="muted small">{u.email}</span>
              </span>
              <span className="user-option-cta">
                {busy === u.id ? "Signing in…" : u.id === currentUserId ? "Current" : "Continue →"}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}
