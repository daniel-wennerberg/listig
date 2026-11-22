"use client";
import type { List } from "./types";

const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const getName = () => safe(() => localStorage.getItem("listig:name") ?? "", "");
export const setName = (n: string) => safe(() => localStorage.setItem("listig:name", n.trim()), undefined);

export const ownerToken = (listId: string) => safe(() => localStorage.getItem(`listig:owner:${listId}`) ?? "", "");
export const setOwnerToken = (listId: string, t: string) =>
  safe(() => localStorage.setItem(`listig:owner:${listId}`, t), undefined);

/** "Det här är min lista" på en enhet utan ägartoken → dölj köpstatus. */
export const surpriseMode = (listId: string) => safe(() => localStorage.getItem(`listig:surprise:${listId}`) === "1", false);
export const setSurpriseMode = (listId: string, on: boolean) =>
  safe(() => (on ? localStorage.setItem(`listig:surprise:${listId}`, "1") : localStorage.removeItem(`listig:surprise:${listId}`)), undefined);
export const spoilerSeen = (listId: string) => safe(() => localStorage.getItem(`listig:seen:${listId}`) === "1", false);
export const setSpoilerSeen = (listId: string) => safe(() => localStorage.setItem(`listig:seen:${listId}`, "1"), undefined);

export type SavedList = Pick<List, "id" | "title" | "type" | "emoji"> & { visited: number };

export const myLists = (): SavedList[] =>
  safe(() => JSON.parse(localStorage.getItem("listig:lists") ?? "[]") as SavedList[], []).sort(
    (a, b) => b.visited - a.visited,
  );

export function rememberList(l: Pick<List, "id" | "title" | "type" | "emoji">) {
  const rest = myLists().filter((x) => x.id !== l.id);
  safe(
    () =>
      localStorage.setItem(
        "listig:lists",
        JSON.stringify([{ id: l.id, title: l.title, type: l.type, emoji: l.emoji, visited: Date.now() }, ...rest]),
      ),
    undefined,
  );
}

export function forgetList(id: string) {
  safe(() => localStorage.setItem("listig:lists", JSON.stringify(myLists().filter((x) => x.id !== id))), undefined);
}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; listId?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.listId) {
    const t = ownerToken(opts.listId);
    if (t) headers["x-owner-token"] = t;
    if (surpriseMode(opts.listId)) headers["x-surprise"] = "1";
  }
  const res = await fetch(path, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Fel ${res.status}`);
  return data as T;
}

export const formatPrice = (p: number | null, currency = "SEK") =>
  p == null
    ? ""
    : new Intl.NumberFormat("sv-SE", {
        style: "currency",
        currency: currency || "SEK",
        maximumFractionDigits: p % 1 === 0 ? 0 : 2,
      }).format(p);

export function timeAgo(ts: number) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "nyss";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min sedan`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h sedan`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} d sedan`;
  return new Date(ts).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

export async function shareList(list: Pick<List, "id" | "title">) {
  const url = `${location.origin}/l/${list.id}`;
  const data = { title: list.title, text: `Kolla in min lista "${list.title}" på Listig`, url };
  if (navigator.share) {
    try {
      await navigator.share(data);
      return "shared";
    } catch {
      return "cancelled";
    }
  }
  await navigator.clipboard.writeText(url);
  return "copied";
}

/** Uppdaterar data i bakgrunden medan fliken är synlig, så alla ser samma lista. */
export function poll(fn: () => void, ms = 4000) {
  const tick = () => document.visibilityState === "visible" && fn();
  const i = setInterval(tick, ms);
  document.addEventListener("visibilitychange", tick);
  return () => {
    clearInterval(i);
    document.removeEventListener("visibilitychange", tick);
  };
}
