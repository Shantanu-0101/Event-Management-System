import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // CLI commands (migrate, seed) prefer the direct connection when one is
    // set (Neon); the app itself uses DATABASE_URL. An empty DIRECT_URL counts
    // as unset. Read lazily so `prisma generate` works in CI without a database.
    url: process.env["DIRECT_URL"] || process.env["DATABASE_URL"],
  },
});
