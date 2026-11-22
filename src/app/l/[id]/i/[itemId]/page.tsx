"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, Icon, NameSheet, Thumb, Toast, useName, useToast } from "@/components/ui";
import { api, formatPrice, poll, timeAgo } from "@/lib/client";
import type { Comment, Item, List, Offer } from "@/lib/types";

interface Data {
  item: Item;
  list: List;
  isOwner: boolean;
  surprise: boolean;
  comments: Comment[];
  offers: Offer[];
  searchLinks: { source: string; url: string }[];
  priceSearchEnabled: boolean;
}

export default function ItemPage() {
  const { id, itemId } = useParams<{ id: string; itemId: string }>();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [name, saveName] = useName();
  const [askName, setAskName] = useState(false);
  const [toast, setToast] = useToast();
  const [editing, setEditing] = useState(false);
  const [searching, setSearching] = useState(false);
  const pending = useRef<(() => void) | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Data>(`/api/items/${itemId}`, { listId: id }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Något gick fel");
    }
  }, [id, itemId]);

  useEffect(() => {
    load();
    return poll(load, 6000);
  }, [load]);

  const withName = (fn: () => void) => {
    if (name) return fn();
    pending.current = fn;
    setAskName(true);
  };

  async function patch(body: Record<string, unknown>) {
    try {
      const { item } = await api<{ item: Item }>(`/api/items/${itemId}`, {
        method: "PATCH",
        listId: id,
        body: { ...body, author: localStorage.getItem("listig:name") ?? "" },
      });
      setData((d) => (d ? { ...d, item } : d));
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Något gick fel");
    }
  }

  async function searchPrices() {
    setSearching(true);
    try {
      const { offers } = await api<{ offers: Offer[] }>(`/api/items/${itemId}/offers`, { listId: id, body: {} });
      setData((d) => (d ? { ...d, offers } : d));
      if (!offers.length) setToast("Hittade inga erbjudanden");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Sökningen misslyckades");
    } finally {
      setSearching(false);
    }
  }

  async function remove() {
    await api(`/api/items/${itemId}`, { method: "DELETE", listId: id });
    router.replace(`/l/${id}`);
  }

  if (error)
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="font-semibold">{error}</p>
        <Link href={`/l/${id}`} className="rounded-full bg-ink px-5 py-3 font-semibold text-paper">
          Tillbaka till listan
        </Link>
      </main>
    );
  if (!data) return <main className="m-4 mt-20 h-72 animate-pulse rounded-3xl bg-card" />;

  const { item, list, surprise, comments, offers } = data;
  const me = name ?? "";
  const wish = list.type === "wish";
  const cheapest = offers.find((o) => o.price != null);

  return (
    <main data-type={list.type} className="pb-32">
      <header className="pt-safe sticky top-0 z-30 flex items-center justify-between bg-paper/90 px-4 pb-2 backdrop-blur">
        <Link href={`/l/${id}`} className="-ml-2 flex items-center gap-1 rounded-full p-2 text-sm font-semibold active:bg-line">
          <Icon name="back" /> {list.emoji} {list.title}
        </Link>
        <button onClick={() => setEditing((e) => !e)} className="rounded-full px-3 py-2 text-sm font-semibold" style={{ color: "var(--accent)" }}>
          {editing ? "Klar" : "Redigera"}
        </button>
      </header>

      {item.image && (
        <div className="mx-4 mt-2 flex aspect-square max-h-80 w-[calc(100%-2rem)] items-center justify-center overflow-hidden rounded-3xl bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.image} alt={item.title} className="h-full w-full object-contain" referrerPolicy="no-referrer" />
        </div>
      )}

      <section className="px-4 pt-5">
        {editing ? (
          <EditForm item={item} onSave={(b) => (patch(b), setEditing(false))} onDelete={remove} />
        ) : (
          <>
            <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight">{item.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
              {item.price != null && <span className="text-xl font-bold text-ink">{formatPrice(item.price, item.currency)}</span>}
              {item.quantity > 1 && <span>{item.quantity} st</span>}
              {item.url && (
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm font-semibold" style={{ color: "var(--accent)" }}>
                  {hostname(item.url)} <Icon name="external" size={14} />
                </a>
              )}
            </div>
            {item.created_by && <p className="mt-1 text-xs text-muted">Tillagd av {item.created_by} · {timeAgo(item.created_at)}</p>}
            {item.note && <p className="mt-4 rounded-2xl bg-card p-4">{item.note}</p>}
          </>
        )}
      </section>

      {/* Åtgärder */}
      {!editing && (
        <section className="mt-5 flex flex-wrap gap-2 px-4">
          {!wish && (
            <button
              onClick={() => withName(() => patch({ checked: !item.checked }))}
              className={`flex items-center gap-2 rounded-full px-5 py-3 font-semibold ${item.checked ? "bg-card" : "text-white"}`}
              style={item.checked ? {} : { background: "var(--accent)" }}
            >
              <Icon name="check" size={18} /> {item.checked ? `Avbockad${item.checked_by ? ` av ${item.checked_by}` : ""} – ångra` : list.type === "shopping" ? "Bocka av" : "Köpt!"}
            </button>
          )}
          {wish && !surprise && !item.reserved_by && (
            <button
              onClick={() => withName(() => patch({ reserved: true }))}
              className="flex items-center gap-2 rounded-full px-5 py-3 font-semibold text-white"
              style={{ background: "var(--accent)" }}
            >
              <Icon name="gift" size={18} /> Jag köper den här
            </button>
          )}
          {wish && !surprise && item.reserved_by && (
            <div className="w-full rounded-3xl bg-card p-4">
              <p className="flex items-center gap-2 font-semibold">
                <Avatar name={item.reserved_by} size={28} />
                {item.reserved_by === me ? "Du" : item.reserved_by} {item.checked ? "har köpt den ✓" : "ska köpa den"}
              </p>
              <p className="mt-1 text-sm text-muted">Syns för alla som fått länken – men inte för {list.owner_name || "listägaren"}.</p>
              {item.reserved_by === me && (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => patch({ checked: !item.checked })}
                    className="flex-1 rounded-full py-2.5 text-sm font-semibold text-white"
                    style={{ background: "var(--accent)" }}
                  >
                    {item.checked ? "Ångra köpt" : "Markera som köpt"}
                  </button>
                  <button onClick={() => patch({ reserved: false })} className="rounded-full bg-paper px-4 py-2.5 text-sm font-semibold">
                    Släpp
                  </button>
                </div>
              )}
            </div>
          )}
          {list.type !== "shopping" && (
            <div className="flex items-center rounded-full bg-card px-2" role="group" aria-label="Hur gärna?">
              {[1, 2].map((p) => (
                <button key={p} onClick={() => patch({ priority: item.priority === p ? p - 1 : p })} aria-label={`Prioritet ${p}`} className="p-2" style={{ color: item.priority >= p ? "var(--accent)" : "var(--color-line)" }}>
                  <Icon name="star" fill size={22} />
                </button>
              ))}
              <span className="pr-2 text-xs text-muted">{["Hur gärna?", "Gärna", "Önskar mest!"][item.priority]}</span>
            </div>
          )}
        </section>
      )}

      {/* Mer info */}
      {item.description && !editing && (
        <section className="mx-4 mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">Om produkten</h2>
          <Expandable text={item.description} />
        </section>
      )}

      {/* Prisjämförelse */}
      <section className="mx-4 mt-6 rounded-3xl border border-line bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Var finns den?</h2>
          {cheapest && <span className="text-sm text-muted">från <b className="text-ink">{formatPrice(cheapest.price, cheapest.currency)}</b></span>}
        </div>

        {data.priceSearchEnabled && (
          <button
            onClick={searchPrices}
            disabled={searching}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3 font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--accent)" }}
          >
            {searching ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Icon name="search" size={18} />}
            {offers.length ? "Sök priser igen" : "Hitta butiker & priser"}
          </button>
        )}

        {offers.length > 0 && (
          <ul className="mb-3 divide-y divide-line">
            {offers.map((o) => (
              <li key={o.id}>
                <a href={o.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 py-3">
                  <Thumb src={o.thumbnail} alt={o.merchant || o.title} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{o.merchant || o.source}</p>
                    <p className="truncate text-xs text-muted">
                      {o.title}
                      {o.rating != null && ` · ★ ${o.rating}${o.reviews ? ` (${o.reviews})` : ""}`}
                    </p>
                  </div>
                  <span className="shrink-0 font-bold">{formatPrice(o.price, o.currency)}</span>
                </a>
              </li>
            ))}
            <li className="pt-2 text-xs text-muted">Uppdaterat {timeAgo(offers[0].fetched_at)} via Google Shopping</li>
          </ul>
        )}

        <div className="grid grid-cols-3 gap-2">
          {data.searchLinks.map((l) => (
            <a key={l.source} href={l.url} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 rounded-2xl bg-paper px-2 py-3 text-center text-xs font-semibold">
              <Icon name="external" size={16} className="text-muted" />
              {l.source}
            </a>
          ))}
        </div>
      </section>

      <Comments
        comments={comments}
        wish={wish}
        surprise={surprise}
        onPost={(body, secret) =>
          withName(async () => {
            try {
              const { comment } = await api<{ comment: Comment }>(`/api/items/${itemId}/comments`, {
                listId: id,
                body: { body, secret, author: localStorage.getItem("listig:name") ?? "" },
              });
              setData((d) => (d ? { ...d, comments: [...d.comments, comment] } : d));
            } catch (e) {
              setToast(e instanceof Error ? e.message : "Kunde inte skicka");
            }
          })
        }
      />

      <NameSheet
        open={askName}
        onClose={() => setAskName(false)}
        onSave={(n) => {
          saveName(n);
          setAskName(false);
          const fn = pending.current;
          pending.current = null;
          setTimeout(() => fn?.(), 0);
        }}
      />
      <Toast msg={toast} />
    </main>
  );
}

const hostname = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

function Expandable({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 280;
  return (
    <div className="rounded-2xl bg-card p-4 text-sm leading-relaxed">
      <p className="whitespace-pre-line">{open || !long ? text : text.slice(0, 280) + "…"}</p>
      {long && (
        <button onClick={() => setOpen(!open)} className="mt-2 font-semibold" style={{ color: "var(--accent)" }}>
          {open ? "Visa mindre" : "Läs mer"}
        </button>
      )}
    </div>
  );
}

function EditForm({ item, onSave, onDelete }: { item: Item; onSave: (b: Record<string, unknown>) => void; onDelete: () => void }) {
  const [f, setF] = useState({
    title: item.title,
    note: item.note,
    quantity: String(item.quantity),
    price: item.price == null ? "" : String(item.price),
    url: item.url,
  });
  const [fetching, setFetching] = useState(false);
  const [extra, setExtra] = useState<{ image?: string; description?: string }>({});
  const field = "w-full rounded-2xl border border-line bg-card px-4 py-3 text-base outline-none focus:border-[var(--accent)]";

  async function fetchInfo() {
    if (!f.url) return;
    setFetching(true);
    try {
      const info = await api<{ title: string; image: string; description: string; price: number | null; url: string }>("/api/unfurl", { body: { url: f.url } });
      setF((x) => ({ ...x, title: x.title || info.title, price: info.price != null ? String(info.price) : x.price, url: info.url }));
      setExtra({ image: info.image, description: info.description });
    } catch {
      // ignorera – användaren kan fylla i själv
    } finally {
      setFetching(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...f, price: f.price.replace(",", "."), ...extra });
      }}
      className="space-y-3"
    >
      <label className="block text-sm font-semibold">
        Namn
        <input className={field + " mt-1"} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required maxLength={200} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-semibold">
          Antal
          <input className={field + " mt-1"} inputMode="numeric" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} />
        </label>
        <label className="block text-sm font-semibold">
          Pris (kr)
          <input className={field + " mt-1"} inputMode="decimal" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="–" />
        </label>
      </div>
      <label className="block text-sm font-semibold">
        Länk till produkt
        <div className="mt-1 flex gap-2">
          <input className={field} type="url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://…" />
          <button type="button" onClick={fetchInfo} disabled={!f.url || fetching} className="shrink-0 rounded-2xl bg-card px-4 text-sm font-semibold disabled:opacity-40">
            {fetching ? "…" : "Hämta info"}
          </button>
        </div>
      </label>
      {extra.image && <Thumb src={extra.image} alt={f.title} size={72} />}
      <label className="block text-sm font-semibold">
        Anteckning
        <textarea className={field + " mt-1"} rows={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Storlek, färg, märke…" maxLength={1000} />
      </label>
      <button className="w-full rounded-2xl py-4 font-semibold text-white" style={{ background: "var(--accent)" }}>
        Spara
      </button>
      <button type="button" onClick={onDelete} className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 font-semibold text-red-600">
        <Icon name="trash" size={18} /> Ta bort från listan
      </button>
    </form>
  );
}

function Comments({ comments, wish, surprise, onPost }: { comments: Comment[]; wish: boolean; surprise: boolean; onPost: (body: string, secret: boolean) => void }) {
  const [text, setText] = useState("");
  const canSecret = wish && !surprise;
  const [secret, setSecret] = useState(true);

  return (
    <section className="mx-4 mt-6">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">Kommentarer ({comments.length})</h2>
      <ul className="space-y-3">
        {comments.map((c) => (
          <li key={c.id} className="flex gap-3">
            <Avatar name={c.author} size={32} />
            <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-card px-4 py-2.5">
              <p className="flex items-center gap-2 text-xs text-muted">
                <b className="text-ink">{c.author}</b> {timeAgo(c.created_at)}
                {c.secret && (
                  <span className="flex items-center gap-0.5" title="Dold för listägaren">
                    <Icon name="lock" size={12} /> hemlig
                  </span>
                )}
              </p>
              <p className="mt-0.5 whitespace-pre-line break-words">{c.body}</p>
            </div>
          </li>
        ))}
        {comments.length === 0 && <li className="text-sm text-muted">Inga kommentarer än. Fråga om storlek, färg eller tipsa om ett bra erbjudande!</li>}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          onPost(text.trim(), canSecret && secret);
          setText("");
        }}
        className="mt-4"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={1}
            placeholder="Skriv en kommentar…"
            maxLength={2000}
            className="min-h-[48px] min-w-0 flex-1 resize-none rounded-3xl border border-line bg-card px-4 py-3 text-base outline-none focus:border-[var(--accent)]"
          />
          <button disabled={!text.trim()} aria-label="Skicka" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40" style={{ background: "var(--accent)" }}>
            <Icon name="send" size={18} />
          </button>
        </div>
        {canSecret && (
          <label className="mt-2 flex items-center gap-2 px-2 text-sm text-muted">
            <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} className="accent-[var(--accent)]" />
            <Icon name="lock" size={14} /> Dölj för listägaren
          </label>
        )}
      </form>
    </section>
  );
}
