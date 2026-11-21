import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { bad, json, loadItem, loadList, str, toComment } from "@/lib/server";

type Ctx = { params: Promise<{ itemId: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { itemId } = await params;
  const row = await loadItem(itemId);
  if (!row) return bad("Saken finns inte", 404);
  const found = await loadList(String(row.list_id), req);
  if (!found) return bad("Listan finns inte", 404);
  const body = await req.json().catch(() => ({}));
  const text = str(body.body, 2000);
  if (!text) return bad("Kommentaren är tom");
  // Hemliga kommentarer (bara på önskelistor, och inte från ägaren själv) döljs för ägaren.
  const secret = found.list.type === "wish" && !found.isOwner && Boolean(body.secret);
  const comment = {
    id: nanoid(12),
    item_id: itemId,
    author: str(body.author, 40) || "Anonym",
    body: text,
    secret: secret ? 1 : 0,
    created_at: Date.now(),
  };
  const c = await db();
  await c.execute({
    sql: "INSERT INTO comments (id, item_id, author, body, secret, created_at) VALUES (:id, :item_id, :author, :body, :secret, :created_at)",
    args: comment,
  });
  return json({ comment: toComment(comment as never) }, 201);
}
