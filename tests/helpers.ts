import { createDb, migrate, type Db } from "@/lib/db";

/** Fresh in-memory database with the seeded users (Alice, Bob, Chris) and welcome doc. */
export async function testDb(): Promise<Db> {
  const db = createDb("file::memory:");
  await migrate(db);
  return db;
}

export const ALICE = "u_alice";
export const BOB = "u_bob";
export const CAROL = "u_carol";
