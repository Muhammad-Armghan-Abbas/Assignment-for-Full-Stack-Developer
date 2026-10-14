import { Pencil } from "lucide-react";

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function Avatar({ name, color, size = 32, ring, editing }: { name: string; color: string; size?: number; ring?: boolean; editing?: boolean }) {
  return (
    <span
      className={`avatar${ring ? " avatar-ring" : ""}`}
      style={{ background: color, width: size, height: size, fontSize: Math.round(size * 0.38) }}
      title={name}
      aria-label={name}
    >
      {initials(name)}
      {editing && (
        <span className="avatar-badge" aria-label="editing">
          <Pencil size={8} strokeWidth={3} />
        </span>
      )}
    </span>
  );
}

export function AvatarStack({ people, max = 4, size = 30 }: { people: { id: string; name: string; color: string; editing?: boolean }[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="avatar-stack" aria-label={`${people.length} people here`}>
      {shown.map((p) => (
        <span key={p.id} title={`${p.name}${p.editing ? " · editing" : " · viewing"}`}>
          <Avatar name={p.name} color={p.color} size={size} ring editing={p.editing} />
        </span>
      ))}
      {extra > 0 && <span className="avatar avatar-more" style={{ width: size, height: size }}>+{extra}</span>}
    </div>
  );
}
