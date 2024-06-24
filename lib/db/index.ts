import "dotenv/config";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schemas";

export const client = createClient({ url: process.env.DATABASE_URL! });

export const db = drizzle(client, { schema });
