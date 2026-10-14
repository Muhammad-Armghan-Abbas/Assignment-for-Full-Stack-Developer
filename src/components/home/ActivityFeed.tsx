import Link from "next/link";
import type { ActivityItem } from "@/lib/activity";
import { timeAgo } from "@/lib/client";
import { Avatar } from "../ui/Avatar";

const ROLE = { viewer: "view", commenter: "comment on", editor: "edit" } as Record<string, string>;

function describe(a: ActivityItem, me: string): React.ReactNode {
  const d = a.detail ?? {};
  switch (a.type) {
    case "created": return "created";
    case "imported": return <>imported <em>{d.file}</em> as</>;
    case "edited": return "edited";
    case "renamed": return "renamed";
    case "restored": return "restored an earlier version of";
    case "commented": return "commented on";
    case "unshared": return <>removed {d.name}&apos;s access to</>;
    case "shared":
      return <>invited {d.name === undefined ? "someone" : d.name} to {ROLE[d.role] ?? "access"}</>;
  }
  void me;
  return a.type;
}

export function ActivityFeed({ items, me }: { items: ActivityItem[]; me: string }) {
  return (
    <section className="activity" aria-label="Recent activity">
      <h2>Recent activity</h2>
      {items.length === 0 ? (
        <p className="muted small">Activity on your documents will show up here.</p>
      ) : (
        <ol>
          {items.map((a) => (
            <li key={a.id}>
              <Avatar name={a.actor.name} color={a.actor.color} size={26} />
              <div>
                <p>
                  <strong>{a.actor.id === me ? "You" : a.actor.name}</strong> {describe(a, me)}{" "}
                  <Link href={`/documents/${a.document.id}`}>{a.document.title}</Link>
                </p>
                {a.type === "commented" && a.detail?.excerpt && <p className="quote small">“{a.detail.excerpt}”</p>}
                <span className="muted small">{timeAgo(a.createdAt)}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
