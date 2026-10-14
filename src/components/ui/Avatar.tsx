import { Pencil } from "lucide-react";

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** A person's photo when they have one, otherwise coloured initials (also the fallback if the photo fails to load). */
export function Avatar({
  name,
  color,
  src,
  size = 32,
  ring,
  editing,
}: {
  name: string;
  color: string;
  src?: string | null;
  size?: number;
  ring?: boolean;
  editing?: boolean;
}) {
  return (
    <span
      className={`avatar${ring ? " avatar-ring" : ""}`}
      style={{ background: color, width: size, height: size, fontSize: Math.round(size * 0.38) }}
      title={name}
      aria-label={name}
      role="img"
    >
      {initials(name)}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="avatar-photo"
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
      )}
      {editing && (
        <span className="avatar-badge" aria-label="editing">
          <Pencil size={8} strokeWidth={3} />
        </span>
      )}
    </span>
  );
}

export function AvatarStack({ people, max = 4, size = 30 }: { people: { id: string; name: string; color: string; avatarUrl?: string | null; editing?: boolean }[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="avatar-stack" aria-label={`${people.length} people here`}>
      {shown.map((p) => (
        <span key={p.id} title={`${p.name}${p.editing ? " · editing" : " · viewing"}`}>
          <Avatar name={p.name} color={p.color} src={p.avatarUrl} size={size} ring editing={p.editing} />
        </span>
      ))}
      {extra > 0 && <span className="avatar avatar-more" style={{ width: size, height: size }}>+{extra}</span>}
    </div>
  );
}
