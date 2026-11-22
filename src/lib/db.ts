import { createClient, type Client } from "@libsql/client";

// Lokalt: SQLite-fil (local.db). I Docker: DATABASE_URL=file:/data/listig.db. Turso: libsql://… + DATABASE_AUTH_TOKEN.
let client: Client | null = null;
let ready: Promise<void> | null = null;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS lists (
    id TEXT PRIMARY KEY,
    owner_token TEXT NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'shopping',
    emoji TEXT NOT NULL DEFAULT '🛒',
    owner_name TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    quantity INTEGER NOT NULL DEFAULT 1,
    url TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    price REAL,
    currency TEXT NOT NULL DEFAULT 'SEK',
    priority INTEGER NOT NULL DEFAULT 0,
    checked INTEGER NOT NULL DEFAULT 0,
    checked_by TEXT NOT NULL DEFAULT '',
    reserved_by TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS items_list ON items(list_id)`,
  `CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    secret INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS comments_item ON comments(item_id)`,
  `CREATE TABLE IF NOT EXISTS offers (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    merchant TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    price REAL,
    currency TEXT NOT NULL DEFAULT 'SEK',
    link TEXT NOT NULL,
    thumbnail TEXT NOT NULL DEFAULT '',
    rating REAL,
    reviews INTEGER,
    fetched_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS offers_item ON offers(item_id)`,
];

export async function db(): Promise<Client> {
  if (!client) {
    client = createClient({
      // DATABASE_URL: "file:/data/listig.db" (Docker/VPS) eller "libsql://…" (Turso)
      url: process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || "file:local.db",
      authToken: process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN,
    });
  }
  if (!ready) {
    const c = client;
    ready = (async () => {
      await c.execute("PRAGMA foreign_keys = ON").catch(() => {});
      await c.batch(SCHEMA, "write");
      // Migreringar för databaser skapade med äldre schema
      for (const sql of [
        "ALTER TABLE lists ADD COLUMN owner_name TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE items ADD COLUMN summary TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE items ADD COLUMN brand TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE items ADD COLUMN gtin TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE items ADD COLUMN category TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE items ADD COLUMN rating REAL",
        "ALTER TABLE items ADD COLUMN review_count INTEGER",
      ]) {
        await c.execute(sql).catch(() => {}); // finns redan
      }
    })();
  }
  await ready;
  return client;
}
