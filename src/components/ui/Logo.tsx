import Link from "next/link";

/** Ajaia mark + product name. */
export function Logo({ href = "/documents", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="logo" aria-label="Ajaia Docs home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/ajaia-mark.png" alt="" width={26} height={24} />
      {!compact && (
        <span className="logo-text">
          Ajaia <span>Docs</span>
        </span>
      )}
    </Link>
  );
}
