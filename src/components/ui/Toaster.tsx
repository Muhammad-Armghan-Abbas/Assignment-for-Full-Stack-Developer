"use client";

import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { useEffect, useState } from "react";

type Kind = "success" | "error" | "info";
interface Toast { id: number; kind: Kind; message: string }

const EVENT = "ajaia:toast";
let seq = 0;

/** Fire-and-forget notifications from anywhere in the client. */
export function toast(message: string, kind: Kind = "info") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<Toast>(EVENT, { detail: { id: ++seq, kind, message } }));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const onToast = (e: Event) => {
      const t = (e as CustomEvent<Toast>).detail;
      setItems((xs) => [...xs.slice(-3), t]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), t.kind === "error" ? 6000 : 3500);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);
  const Icon = { success: CheckCircle2, error: AlertCircle, info: Info };
  return (
    <div className="toaster" aria-live="polite">
      {items.map((t) => {
        const I = Icon[t.kind];
        return (
          <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === "error" ? "alert" : "status"}>
            <I size={18} />
            <span>{t.message}</span>
            <button className="icon-btn" aria-label="Dismiss" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}>
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
