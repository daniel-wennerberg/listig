import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { api } from "./app";

const app = new Hono();
app.use("/api/*", logger());
app.route("/api", api);
app.all("/api/*", (c) => c.json({ error: "Finns inte" }, 404));

// I produktion levererar servern även klienten (byggda filer från client/dist).
const staticDir = process.env.STATIC_DIR;
if (staticDir) {
  // Filnamnen i /assets innehåller en hash → kan cachas för evigt
  app.use("/assets/*", async (c, next) => {
    await next();
    c.header("Cache-Control", "public, max-age=31536000, immutable");
  });
  app.use("/*", serveStatic({ root: staticDir }));
  // Alla andra sökvägar (/l/abc, /l/abc/i/xyz …) → index.html, klienten sköter routingen
  app.get("*", serveStatic({ path: `${staticDir}/index.html` }));
}

const port = Number(process.env.PORT ?? 3001);
const hostname = process.env.HOST ?? "0.0.0.0";
serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`Listig-server på http://${hostname}:${info.port}${staticDir ? ` (klient från ${staticDir})` : " (bara API)"}`);
});
