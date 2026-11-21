import type { Row } from "@libsql/client";
import { NextResponse } from "next/server";
import { db } from "./db";
import type { Comment, Item, List, Offer } from "./types";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const bad = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });

export const str = (v: unknown, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function toList(r: Row): List {
  return {
    id: String(r.id),
    title: String(r.title),
    type: r.type as List["type"],
    emoji: String(r.emoji),
    created_at: Number(r.created_at),
  };
}

export function toItem(r: Row, hideReservations = false): Item {
  return {
    id: String(r.id),
    list_id: String(r.list_id),
    title: String(r.title),
    note: String(r.note),
    quantity: Number(r.quantity),
    url: String(r.url),
    image: String(r.image),
    description: String(r.description),
    price: r.price == null ? null : Number(r.price),
    currency: String(r.currency),
    priority: Number(r.priority),
    checked: hideReservations ? false : Boolean(r.checked),
    checked_by: hideReservations ? "" : String(r.checked_by),
    reserved_by: hideReservations ? "" : String(r.reserved_by),
    created_by: String(r.created_by),
    created_at: Number(r.created_at),
    comment_count: r.comment_count == null ? undefined : Number(r.comment_count),
  };
}

export function toComment(r: Row): Comment {
  return {
    id: String(r.id),
    item_id: String(r.item_id),
    author: String(r.author),
    body: String(r.body),
    secret: Boolean(r.secret),
    created_at: Number(r.created_at),
  };
}

export function toOffer(r: Row): Offer {
  return {
    id: String(r.id),
    item_id: String(r.item_id),
    source: String(r.source),
    merchant: String(r.merchant),
    title: String(r.title),
    price: r.price == null ? null : Number(r.price),
    currency: String(r.currency),
    link: String(r.link),
    thumbnail: String(r.thumbnail),
    rating: r.rating == null ? null : Number(r.rating),
    reviews: r.reviews == null ? null : Number(r.reviews),
    fetched_at: Number(r.fetched_at),
  };
}

/** Hämtar listan + avgör om anroparen är ägare (via x-owner-token). */
export async function loadList(listId: string, req: Request) {
  const c = await db();
  const res = await c.execute({ sql: "SELECT * FROM lists WHERE id = ?", args: [listId] });
  const row = res.rows[0];
  if (!row) return null;
  const isOwner = req.headers.get("x-owner-token") === String(row.owner_token);
  return { list: toList(row), isOwner };
}

/** Önskelistor: ägaren ska inte se vad som är reserverat (överraskning!). */
export const hidesReservations = (list: List, isOwner: boolean) => list.type === "wish" && isOwner;

export async function loadItem(itemId: string) {
  const c = await db();
  const res = await c.execute({ sql: "SELECT * FROM items WHERE id = ?", args: [itemId] });
  return res.rows[0] ?? null;
}
