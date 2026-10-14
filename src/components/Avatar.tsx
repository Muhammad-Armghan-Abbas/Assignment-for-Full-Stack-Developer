export function Avatar({ name, color, size = 32 }: { name: string; color: string; size?: number }) {
  return (
    <span className="avatar" style={{ background: color, width: size, height: size, fontSize: size * 0.42 }} aria-hidden>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
