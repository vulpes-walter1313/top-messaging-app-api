import "dotenv/config";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schemas";

export function getConfig() {
  if (process.env.NODE_ENV === "development") {
    console.log("dev config used");
    return { url: process.env.DEV_DATABASE_URL! };
  } else {
    console.log("prod config used");
    return {
      url: process.env.PROD_DATABASE_URL!,
      authToken: process.env.PROD_DATABASE_TOKEN!,
    };
  }
}
export const client = createClient(getConfig());

export const db = drizzle(client, { schema });
