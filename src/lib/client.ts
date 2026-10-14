"use client";

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** fetch + JSON with the API's `{ error: { code, message } }` shape turned into an ApiError. */
export async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : undefined;
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { ...headers, ...init.headers } });
  } catch {
    throw new ApiError(0, "network", "Can't reach the server. Check your connection.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.code ?? "unknown", body?.error?.message ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export function timeAgo(iso: string): string {
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
