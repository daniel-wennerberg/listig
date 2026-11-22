"use client";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Avatar,
  Icon,
  NameSheet,
  Sheet,
  Thumb,
  Toast,
  useName,
  useToast,
} from "@/components/ui";
import {
  api,
  forgetList,
  formatPrice,
  ownerToken,
  poll,
  rememberList,
  setOwnerToken,
  setSpoilerSeen,
  setSurpriseMode,
  shareList,
  spoilerSeen,
} from "@/lib/client";
import { LIST_TYPES, type Item, type List } from "@/lib/types";

interface Data {
  list: List;
  isOwner: boolean;
  surprise: boolean;
  items: Item[];
}

export default function ListPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const [ready, setReady] = useState(false);
  const [gate, setGate] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, saveName] = useName();
  const [askName, setAskName] = useState(false);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useToast();
  const pending = useRef<(() => void) | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<Data>(`/api/lists/${id}`, { listId: id });
      setData(d);
      rememberList(d.list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Något gick fel");
    }
  }, [id]);

  // Ägarlänk (?owner=…) öppnad på en ny enhet: spara token och städa URL:en.
  useEffect(() => {
    const t = search.get("owner");
    if (t) {
      setOwnerToken(id, t);
      setSurpriseMode(id, false);
      router.replace(`/l/${id}`);
    }
    setReady(true);
  }, [id, search, router]);

  useEffect(() => {
    if (!ready) return;
    load();
    return poll(load);
  }, [load, ready]);

  // Önskelista öppnad av någon som inte är ägare: fråga först, så ägaren inte råkar se spoilers.
  useEffect(() => {
    if (
      data &&
      data.list.type === "wish" &&
      !data.surprise &&
      !data.isOwner &&
      !spoilerSeen(id)
    )
      setGate(true);
  }, [data, id]);

  /** Kör en åtgärd som kräver namn – fråga efter namnet först om det saknas. */
  const withName = (fn: () => void) => {
    if (name) return fn();
    pending.current = fn;
    setAskName(true);
  };

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    withName(async () => {
      setAdding(true);
      try {
        const { item, crawled } = await api<{ item: Item; crawled: boolean | null }>(`/api/lists/${id}/items`, {
          listId: id,
          body: { title: t, author: localStorage.getItem("listig:name") ?? "" },
        });
        setText("");
        setData((d) => (d ? { ...d, items: [item, ...d.items] } : d));
        if (crawled === false) setToast("Sidan gick inte att läsa – namnet är gissat från länken");
        else if (crawled) setToast(`Hämtade info om ${item.title}`);
      } catch (err) {
        setToast(err instanceof Error ? err.message : "Kunde inte lägga till");
      } finally {
        setAdding(false);
      }
    });
  }

  async function patch(item: Item, body: Record<string, unknown>) {
    const me = localStorage.getItem("listig:name") ?? "";
    try {
      const { item: next } = await api<{ item: Item }>(
        `/api/items/${item.id}`,
        {
          method: "PATCH",
          listId: id,
          body: { ...body, author: me },
        },
      );
      setData((d) =>
        d
          ? {
              ...d,
              items: d.items.map((i) =>
                i.id === item.id
                  ? { ...next, comment_count: i.comment_count }
                  : i,
              ),
            }
          : d,
      );
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Något gick fel");
      load();
    }
  }

  async function share() {
    if (!data) return;
    const r = await shareList(data.list);
    if (r === "copied")
      setToast("Länken är kopierad – skicka den till vem du vill!");
  }

  async function removeList() {
    if (!data) return;
    await api(`/api/lists/${id}`, { method: "DELETE", listId: id });
    forgetList(id);
    router.replace("/");
  }

  if (error)
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-5xl">🤷</p>
        <p className="font-semibold">{error}</p>
        <Link
          href="/"
          className="rounded-full bg-ink px-5 py-3 font-semibold text-paper"
        >
          Till startsidan
        </Link>
      </main>
    );

  if (!data)
    return (
      <main className="space-y-3 p-4 pt-20">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-3xl bg-card" />
        ))}
      </main>
    );

  const { list, items, isOwner, surprise } = data;
  const whose = list.owner_name ? `${list.owner_name}s` : "";
  // Visa inga köp förrän besökaren svarat på om det är deras egen lista.
  const needsGate =
    list.type === "wish" && !isOwner && !surprise && !spoilerSeen(id);
  const type = LIST_TYPES[list.type];
  const open = items.filter(
    (i) => !(list.type === "wish" ? i.reserved_by : i.checked),
  );
  const done = items.filter((i) =>
    list.type === "wish" ? i.reserved_by : i.checked,
  );
  const total = items.reduce((s, i) => s + (i.price ?? 0) * i.quantity, 0);

  return (
    <main data-type={list.type} className="pb-36">
      <header className="pt-safe sticky top-0 z-30 border-b border-line bg-paper/90 px-4 pb-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            aria-label="Tillbaka"
            className="-ml-2 rounded-full p-2 active:bg-line"
          >
            <Icon name="back" />
          </Link>
          <div className="flex items-center gap-1">
            <button
              onClick={share}
              className="flex items-center gap-2 rounded-full px-4 py-2 font-semibold text-white"
              style={{ background: "var(--accent)" }}
            >
              <Icon name="share" size={18} /> Dela
            </button>
            <button
              onClick={() => setMenu(true)}
              aria-label="Mer"
              className="rounded-full p-2 active:bg-line"
            >
              <Icon name="more" />
            </button>
          </div>
        </div>
        <h1 className="font-display mt-2 flex items-center gap-2 text-3xl font-extrabold tracking-tight">
          <span>{list.emoji}</span>
          <span className="truncate">{list.title}</span>
        </h1>
        <p className="mt-1 text-sm text-muted">
          <span style={{ color: "var(--accent)" }} className="font-semibold">
            {whose ? `${whose} ${type.label.toLowerCase()}` : type.label}
          </span>
          {" · "}
          {items.length} {items.length === 1 ? "sak" : "saker"}
          {total > 0 && ` · ca ${formatPrice(total)}`}
        </p>
      </header>

      {list.type === "wish" && (
        <p className="mx-4 mt-4 flex items-start gap-2 rounded-2xl bg-card p-3 text-sm text-muted">
          <Icon name="gift" size={18} className="mt-0.5 shrink-0" />
          {surprise
            ? "Det här är din önskelista. Du ser inte vad andra köper – så överraskningen håller."
            : `Markera det du tänker köpa så ingen annan köper samma. Alla som fått länken ser vem som köper vad – men inte ${list.owner_name || "listägaren"}.`}
        </p>
      )}

      {items.length === 0 && (
        <div className="px-8 py-16 text-center text-muted">
          <p className="text-5xl">{list.emoji}</p>
          <p className="mt-4">
            Listan är tom. Skriv något nedan – eller klistra in en länk till en
            produkt så hämtar vi bild och pris.
          </p>
        </div>
      )}

      {!needsGate && (
        <>
          <ul className="space-y-2 px-4 pt-4">
            {open.map((item) => (
              <Row
                key={item.id}
                item={item}
                list={list}
                surprise={surprise}
                onPatch={(b) => withName(() => patch(item, b))}
              />
            ))}
          </ul>

          {done.length > 0 && (
            <>
              <h2 className="mt-6 mb-2 px-5 text-xs font-semibold uppercase tracking-widest text-muted">
                {list.type === "wish" ? "Någon köper" : "Klart"} ({done.length})
              </h2>
              <ul className="space-y-2 px-4 opacity-60">
                {done.map((item) => (
                  <Row
                    key={item.id}
                    item={item}
                    list={list}
                    surprise={surprise}
                    onPatch={(b) => withName(() => patch(item, b))}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      )}

      <form
        onSubmit={add}
        className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-4 pt-3 backdrop-blur"
      >
        {adding && /https?:\/\//.test(text) && (
          <p className="mx-auto mb-2 flex max-w-xl items-center gap-2 px-2 text-sm text-muted">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
            Läser sidan och letar produktinfo…
          </p>
        )}
        <div className="mx-auto flex max-w-xl gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              list.type === "shopping"
                ? "Lägg till… (t.ex. mjölk)"
                : "Sak eller klistra in länk…"
            }
            enterKeyHint="done"
            className="min-w-0 flex-1 rounded-full border border-line bg-card px-5 py-3.5 text-base outline-none focus:border-[var(--accent)]"
          />
          <button
            disabled={adding || !text.trim()}
            aria-label="Lägg till"
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full text-white transition disabled:opacity-40"
            style={{ background: "var(--accent)" }}
          >
            {adding ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <Icon name="plus" />
            )}
          </button>
        </div>
      </form>

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

      <Sheet open={menu} onClose={() => setMenu(false)}>
        <div className="space-y-2 pb-2">
          <p className="px-1 text-sm text-muted">
            Inloggad som <b className="text-ink">{name || "–"}</b>
            {isOwner && " · du äger listan"}
          </p>
          <button
            onClick={() => (setMenu(false), setAskName(true))}
            className="w-full rounded-2xl bg-paper p-4 text-left font-semibold"
          >
            Byt namn
          </button>
          {isOwner && list.type === "wish" && (
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(
                  `${location.origin}/l/${id}?owner=${ownerToken(id)}`,
                );
                setMenu(false);
                setToast(
                  "Ägarlänk kopierad – öppna den på din telefon. Dela den inte!",
                );
              }}
              className="w-full rounded-2xl bg-paper p-4 text-left font-semibold"
            >
              Kopiera ägarlänk
              <span className="block text-sm font-normal text-muted">
                Öppna listan som ägare på din andra enhet, utan spoilers
              </span>
            </button>
          )}
          {!isOwner && list.type === "wish" && (
            <button
              onClick={() => {
                setSurpriseMode(id, !surprise);
                setSpoilerSeen(id);
                setMenu(false);
                load();
              }}
              className="w-full rounded-2xl bg-paper p-4 text-left font-semibold"
            >
              {surprise
                ? "Visa vad som är köpt (spoilers!)"
                : "Det här är min lista – dölj vad som är köpt"}
            </button>
          )}
          {isOwner ? (
            <button
              onClick={removeList}
              className="w-full rounded-2xl bg-paper p-4 text-left font-semibold text-red-600"
            >
              Ta bort listan för alla
            </button>
          ) : (
            <button
              onClick={() => (forgetList(id), router.replace("/"))}
              className="w-full rounded-2xl bg-paper p-4 text-left font-semibold text-red-600"
            >
              Ta bort från mina listor
            </button>
          )}
        </div>
      </Sheet>

      <Sheet
        open={gate || needsGate}
        onClose={() => (setSpoilerSeen(id), setGate(false))}
        title={`🎁 ${whose || "En"} önskelista`}
      >
        <p className="mb-5 text-muted">
          Här ser du vad andra har tänkt köpa, så ni inte köper samma sak.
          {list.owner_name ? ` ${list.owner_name} ser inte det.` : ""} Är det
          här din egen lista? Då döljer vi det så överraskningen håller.
        </p>
        <div className="space-y-2 pb-2">
          <button
            onClick={() => (setSpoilerSeen(id), setGate(false))}
            className="w-full rounded-2xl py-4 font-semibold text-white"
            style={{ background: "var(--accent)" }}
          >
            Jag ska köpa en present
          </button>
          <button
            onClick={() => {
              setSurpriseMode(id, true);
              setSpoilerSeen(id);
              setGate(false);
              setData(null);
              load();
            }}
            className="w-full rounded-2xl bg-paper py-4 font-semibold"
          >
            Det är min lista – visa inget
          </button>
        </div>
      </Sheet>

      <Toast msg={toast} />
    </main>
  );
}

function Row({
  item,
  list,
  surprise,
  onPatch,
}: {
  item: Item;
  list: List;
  surprise: boolean;
  onPatch: (b: Record<string, unknown>) => void;
}) {
  const wish = list.type === "wish";
  const done = wish ? Boolean(item.reserved_by) : item.checked;
  const href = `/l/${list.id}/i/${item.id}`;

  return (
    <li className="flex items-center gap-3 rounded-3xl border border-line bg-card p-3">
      {!wish && (
        <button
          onClick={() => onPatch({ checked: !item.checked })}
          aria-label={item.checked ? "Avbocka" : "Bocka av"}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition ${item.checked ? "animate-pop border-[var(--accent)] bg-[var(--accent)] text-white" : "border-line"}`}
        >
          {item.checked && <Icon name="check" size={18} />}
        </button>
      )}
      <Link href={href} className="flex min-w-0 flex-1 items-center gap-3">
        {(item.image || list.type !== "shopping") && (
          <Thumb src={item.image} alt={item.title} size={52} />
        )}
        <div className="min-w-0 flex-1">
          <p
            className={`truncate font-medium ${done && !wish ? "line-through" : ""}`}
          >
            {item.quantity > 1 && (
              <span
                className="mr-1 font-bold"
                style={{ color: "var(--accent)" }}
              >
                {item.quantity}×
              </span>
            )}
            {item.title}
          </p>
          <p className="flex items-center gap-2 truncate text-sm text-muted">
            {item.priority > 0 && (
              <span style={{ color: "var(--accent)" }}>
                {"★".repeat(item.priority)}
              </span>
            )}
            {item.price != null && (
              <span>{formatPrice(item.price, item.currency)}</span>
            )}
            {item.note && <span className="truncate">{item.note}</span>}
            {!!item.comment_count && (
              <span className="flex items-center gap-0.5">
                <Icon name="chat" size={14} /> {item.comment_count}
              </span>
            )}
            {item.checked && item.checked_by && !wish && (
              <span>✓ {item.checked_by}</span>
            )}
          </p>
        </div>
      </Link>
      {wish &&
        !surprise &&
        (item.reserved_by ? (
          <Link
            href={href}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-paper py-1.5 pl-1.5 pr-3 text-xs font-semibold"
          >
            <Avatar name={item.reserved_by} size={22} />
            <span>
              {item.reserved_by}
              <span className="block font-normal text-muted">
                {item.checked ? "✓ köpt" : "ska köpa"}
              </span>
            </span>
          </Link>
        ) : (
          <button
            onClick={() => onPatch({ reserved: true })}
            className="shrink-0 rounded-full border-2 border-[var(--accent)] px-3 py-1.5 text-xs font-bold"
            style={{ color: "var(--accent)" }}
          >
            Jag köper
          </button>
        ))}
    </li>
  );
}
