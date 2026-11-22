import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { bad, json, str } from "@/lib/server";
import { LIST_TYPES, type ListType } from "@/lib/types";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const type = (body.type in LIST_TYPES ? body.type : "shopping") as ListType;
  const title = str(body.title, 80) || LIST_TYPES[type].label;
  const emoji = str(body.emoji, 8) || LIST_TYPES[type].emoji;
  if (!title) return bad("Titel saknas");
  const ownerName = str(body.ownerName, 40);
  const id = nanoid(10);
  const ownerToken = nanoid(24);
  const c = await db();
  const now = Date.now();
  await c.execute({
    sql: "INSERT INTO lists (id, owner_token, title, type, emoji, owner_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [id, ownerToken, title, type, emoji, ownerName, now],
  });
  return json({ list: { id, title, type, emoji, owner_name: ownerName, created_at: now }, ownerToken }, 201);
}
