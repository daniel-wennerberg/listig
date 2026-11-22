import { Hono } from "hono";
import { nanoid } from "nanoid";
import { LIST_TYPES, type ListType } from "@shared/types";
import { db } from "../lib/db";
import { applyProductInfo, searchPricesLater, searchQuery } from "../lib/product";
import { bad, hidesReservations, json, loadList, str, toItem } from "../lib/server";
import { crawlProduct, isSafeUrl } from "../lib/unfurl";

export const lists = new Hono();

/** Skapa lista → { list, ownerToken } */
lists.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const type = (body.type in LIST_TYPES ? body.type : "shopping") as ListType;
  const title = str(body.title, 80) || LIST_TYPES[type].label;
  const emoji = str(body.emoji, 8) || LIST_TYPES[type].emoji;
  const ownerName = str(body.ownerName, 40);
  const id = nanoid(10);
  const ownerToken = nanoid(24);
  const now = Date.now();
  await (await db()).execute({
    sql: "INSERT INTO lists (id, owner_token, title, type, emoji, owner_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [id, ownerToken, title, type, emoji, ownerName, now],
  });
  return json({ list: { id, title, type, emoji, owner_name: ownerName, created_at: now }, ownerToken }, 201);
});

/** Lista med saker. Önskelistans ägare ser inte vad som är köpt. */
lists.get("/:id", async (c) => {
  const id = c.req.param("id");
  const found = await loadList(id, c.req.raw);
  if (!found) return bad("Listan finns inte", 404);
  const hide = hidesReservations(found.list, found.isOwner, found.surprise);
  const res = await (await db()).execute({
    sql: `SELECT i.*, (SELECT COUNT(*) FROM comments c WHERE c.item_id = i.id ${hide ? "AND c.secret = 0" : ""}) AS comment_count
          FROM items i WHERE i.list_id = ? ORDER BY ${hide ? "" : "i.checked ASC,"} i.priority DESC, i.created_at DESC`,
    args: [id],
  });
  return json({ ...found, items: res.rows.map((r) => toItem(r, hide)) });
});

lists.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const found = await loadList(id, c.req.raw);
  if (!found) return bad("Listan finns inte", 404);
  if (!found.isOwner) return bad("Bara ägaren kan ändra listan", 403);
  const body = await c.req.json().catch(() => ({}));
  const title = str(body.title, 80) || found.list.title;
  const emoji = str(body.emoji, 8) || found.list.emoji;
  await (await db()).execute({ sql: "UPDATE lists SET title = ?, emoji = ? WHERE id = ?", args: [title, emoji, id] });
  return json({ list: { ...found.list, title, emoji } });
});

lists.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const found = await loadList(id, c.req.raw);
  if (!found) return bad("Listan finns inte", 404);
  if (!found.isOwner) return bad("Bara ägaren kan ta bort listan", 403);
  await (await db()).batch(
    [
      { sql: "DELETE FROM comments WHERE item_id IN (SELECT id FROM items WHERE list_id = ?)", args: [id] },
      { sql: "DELETE FROM offers WHERE item_id IN (SELECT id FROM items WHERE list_id = ?)", args: [id] },
      { sql: "DELETE FROM items WHERE list_id = ?", args: [id] },
      { sql: "DELETE FROM lists WHERE id = ?", args: [id] },
    ],
    "write",
  );
  return json({ ok: true });
});

/** Lägg till sak. En länk (ev. med text runt) crawlas efter produktinfo. */
lists.post("/:id/items", async (c) => {
  const id = c.req.param("id");
  const found = await loadList(id, c.req.raw);
  if (!found) return bad("Listan finns inte", 404);
  const body = await c.req.json().catch(() => ({}));

  let title = str(body.title, 2000);
  let url = str(body.url, 2000);
  let note = str(body.note, 1000);
  // Produktnamnet hämtas från sidan och texten runt länken blir en anteckning.
  const pasted = title.match(/https?:\/\/\S+/)?.[0];
  if (!url && pasted && isSafeUrl(pasted)) {
    url = pasted;
    note = [title.replace(pasted, "").trim(), note].filter(Boolean).join("\n").slice(0, 1000);
    title = "";
  }
  title = title.slice(0, 200);

  const info = url ? await crawlProduct(url) : null;
  if (url && !info) return bad("Länken kan inte användas");
  title ||= info?.title ?? "";
  if (!title) return bad("Skriv vad du vill lägga till");

  const row = {
    id: nanoid(12),
    list_id: id,
    title,
    note,
    quantity: Math.max(1, Math.min(999, Number(body.quantity) || 1)),
    created_by: str(body.author, 40),
    created_at: Date.now(),
  };
  const client = await db();
  await client.execute({
    sql: `INSERT INTO items (id, list_id, title, note, quantity, created_by, created_at)
          VALUES (:id, :list_id, :title, :note, :quantity, :created_by, :created_at)`,
    args: row,
  });
  if (info) await applyProductInfo(row.id, info, false);
  // Google Shopping för saker från länkar – och för önske-/vill ha-listor även utan länk
  if (info || found.list.type !== "shopping") searchPricesLater(row.id, searchQuery({ title, brand: info?.brand }));

  const saved = await client.execute({ sql: "SELECT *, 0 AS comment_count FROM items WHERE id = ?", args: [row.id] });
  return json({ item: toItem(saved.rows[0]), crawled: info?.crawled ?? null }, 201);
});
