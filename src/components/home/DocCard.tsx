import { Eye, MessageSquare, Pencil, Users } from "lucide-react";
import Link from "next/link";
import type { DocumentSummary } from "@/lib/documents";
import { timeAgo } from "@/lib/client";
import { Avatar } from "../ui/Avatar";

export const ROLE_LABEL = { owner: "Owner", editor: "Can edit", commenter: "Can comment", viewer: "Can view" } as const;
const ROLE_ICON = { owner: Pencil, editor: Pencil, commenter: MessageSquare, viewer: Eye } as const;

export function DocCard({ doc }: { doc: DocumentSummary }) {
  const Icon = ROLE_ICON[doc.role];
  // Most documents open with their title as a heading; don't repeat it in the preview.
  const body = doc.excerpt.startsWith(doc.title) ? doc.excerpt.slice(doc.title.length).trim() : doc.excerpt;
  return (
    <Link href={`/documents/${doc.id}`} className="doc-card" data-testid="doc-card">
      <div className="doc-preview" aria-hidden>
        <strong>{doc.title}</strong>
        <span>{body || "Empty document"}</span>
      </div>
      <div className="doc-card-body">
        <span className="doc-title">{doc.title}</span>
        <div className="doc-meta-row">
          <Avatar name={doc.owner.name} color={doc.owner.color} size={20} />
          <span className="muted small truncate">{doc.role === "owner" ? "You" : doc.owner.name} · {timeAgo(doc.updatedAt)}</span>
        </div>
        <div className="doc-meta-row">
          <span className={`badge badge-${doc.role}`}>
            <Icon size={12} /> {ROLE_LABEL[doc.role]}
          </span>
          {doc.collaborators > 0 && (
            <span className="muted small" title={`Shared with ${doc.collaborators} ${doc.collaborators === 1 ? "person" : "people"}`}>
              <Users size={13} /> {doc.collaborators}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
