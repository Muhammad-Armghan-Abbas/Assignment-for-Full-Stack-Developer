import { listUsers, getCurrentUser } from "@/lib/auth";
import { LoginPicker } from "@/components/LoginPicker";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const [users, current] = await Promise.all([listUsers(), getCurrentUser()]);
  return (
    <main className="login">
      <div className="login-card">
        <div className="brand brand-lg">
          <span className="brand-mark">A</span> Ajaia Docs
        </div>
        <p className="muted">
          Demo sign-in — pick a seeded account. Sign in as different users (or use a private window) to try sharing.
        </p>
        <LoginPicker users={users} currentUserId={current?.id ?? null} />
      </div>
    </main>
  );
}
