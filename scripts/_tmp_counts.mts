import "./_env";
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL!);
const r = await sql`select (select count(*) from weekly_snapshots) snaps, (select count(*) from reports) reports, (select count(*) from market_context) mc, (select count(*) from nav_history) navs, (select count(*) from category_peers) peers, (select count(*) from funds) funds`;
console.log(JSON.stringify(r[0]));
