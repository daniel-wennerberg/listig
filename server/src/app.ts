import { Hono } from "hono";
import { db } from "./lib/db";
import { items } from "./routes/items";
import { lists } from "./routes/lists";

/** REST-API:t – monteras under /api. */
export const api = new Hono()
  .route("/lists", lists)
  .route("/items", items)
  .get("/health", async (c) => {
    try {
      await (await db()).execute("SELECT 1");
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e instanceof Error ? e.message : "db" }, 503);
    }
  });
