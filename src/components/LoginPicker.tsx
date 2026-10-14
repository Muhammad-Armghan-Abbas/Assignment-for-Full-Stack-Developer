"use client";

import { ArrowRight, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client";
import type { User } from "@/lib/auth";
import { Avatar } from "./ui/Avatar";

export function LoginPicker({ users, currentUserId }: { users: (User & { hint: string })[]; currentUserId: string | null }) {
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
            <button className="user-option" onClick={() => signIn(u.id)} disabled={busy !== null} aria-label={`Continue as ${u.name}`}>
              <Avatar name={u.name} color={u.color} src={u.avatarUrl} size={42} />
              <span className="user-option-text">
                <strong>
                  {u.name} {u.id === currentUserId && <span className="pill">Signed in</span>}
                </strong>
                <span className="muted small">{u.email}</span>
                {u.hint && <span className="hint">{u.hint}</span>}
              </span>
              {busy === u.id ? <Loader2 className="spin" size={18} /> : <ArrowRight size={18} className="user-option-arrow" />}
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}
