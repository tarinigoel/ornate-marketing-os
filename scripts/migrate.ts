// Production migration + seed (Neon). Run in the Vercel build: `npm run db:migrate && next build`.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import * as schema from "../src/db/schema";
import { seedIfEmpty } from "../src/db/seed";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = drizzle({ client: neon(url), schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  await seedIfEmpty(db as never);
  console.log("Migrated and seeded.");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
