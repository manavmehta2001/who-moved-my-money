import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { databaseUrl } from "@/lib/env";
import * as schema from "./schema";

export type Db = NeonHttpDatabase<typeof schema>;

let instance: Db | undefined;

export function db(): Db {
  if (!instance) instance = drizzle({ client: neon(databaseUrl()), schema });
  return instance;
}
