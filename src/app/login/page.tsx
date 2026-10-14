import { History, MessageSquareText, ShieldCheck, Users } from "lucide-react";
import type { Metadata } from "next";
import { getCurrentUser, listUsers } from "@/lib/auth";
import { LoginPicker } from "@/components/LoginPicker";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

const HINTS: Record<string, string> = {
  u_alice: "Owns the Welcome doc · can comment on Bob's plan",
  u_bob: "Owns the Q4 Launch Plan · edits Alice's doc",
  u_carol: "View-only on the launch plan — try sharing with her",
};

export default async function LoginPage() {
  const [users, current] = await Promise.all([listUsers(), getCurrentUser()]);
  return (
    <main className="login">
      <section className="login-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/ajaia-wordmark-white.png" alt="Ajaia" className="login-wordmark" />
        <h1>Write, review and ship documents together.</h1>
        <ul className="login-points">
          <li><Users size={18} /> Share with editors, commenters or viewers</li>
          <li><MessageSquareText size={18} /> Comment on exact passages and resolve threads</li>
          <li><History size={18} /> Every editing session is versioned and restorable</li>
          <li><ShieldCheck size={18} /> Permissions enforced on the server, not just hidden in the UI</li>
        </ul>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <h2>Sign in to Ajaia Docs</h2>
          <p className="muted">
            This is a demo: choose an account — no password. Open a private window as a second user to see sharing, comments and live presence.
          </p>
          <LoginPicker users={users.map((u) => ({ ...u, hint: HINTS[u.id] ?? "" }))} currentUserId={current?.id ?? null} />
        </div>
      </section>
    </main>
  );
}
