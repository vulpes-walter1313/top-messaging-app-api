import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schemas";

const client = createClient({ url: process.env.DATABASE_URL! });

export const db = drizzle(client, { schema });
