import "server-only";
import path from "node:path";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";
import { seedIfEmpty } from "./seed";

export type DB = PgliteDatabase<typeof schema>;

const g = globalThis as unknown as { __omosDb?: Promise<DB> };

async function connect(): Promise<DB> {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  if (process.env.DATABASE_URL) {
    // Production: Neon over HTTP. Migrations run in the build step (npm run db:migrate).
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    const db = drizzle({ client: neon(process.env.DATABASE_URL), schema });
    return db as unknown as DB;
  }
  // Local: PGlite on disk.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = path.join(process.cwd(), ".data", "pglite");
  (await import("node:fs")).mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder });
  await seedIfEmpty(db);
  return db;
}

export function getDb(): Promise<DB> {
  if (!g.__omosDb) {
    g.__omosDb = connect().catch((e) => {
      g.__omosDb = undefined;
      throw e;
    });
  }
  return g.__omosDb;
}

export { schema };
