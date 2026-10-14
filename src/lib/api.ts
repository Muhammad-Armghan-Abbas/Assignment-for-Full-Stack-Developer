import { NextResponse } from "next/server";
import { AppError } from "./errors";

/** Wrap a route handler so AppErrors become JSON responses and everything else is a logged 500. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof AppError) {
        return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
      }
      console.error(err);
      return NextResponse.json(
        { error: { code: "internal", message: "Something went wrong. Please try again." } },
        { status: 500 },
      );
    }
  };
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new AppError(400, "bad_request", "Request body must be a JSON object");
}
