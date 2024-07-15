import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { getConfig } from "./lib/db";

export default defineConfig({
  dialect: "sqlite", // "mysql" | "sqlite" | "postgresql"
  driver: "turso",
  schema: "./lib/db/schemas.ts",
  out: "./drizzle",
  dbCredentials: getConfig(),
});
