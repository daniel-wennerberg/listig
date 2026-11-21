"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, Sheet } from "@/components/ui";
import { api, myLists, rememberList, setOwnerToken, type SavedList } from "@/lib/client";
import { LIST_TYPES, type List, type ListType } from "@/lib/types";

export default function Home() {
  const router = useRouter();
  const [lists, setLists] = useState<SavedList[] | null>(null);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ListType>("shopping");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setLists(myLists()), []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { list, ownerToken } = await api<{ list: List; ownerToken: string }>("/api/lists", {
        body: { title, type },
      });
      setOwnerToken(list.id, ownerToken);
      rememberList(list);
      router.push(`/l/${list.id}`);
    } catch {
      setBusy(false);
    }
  }

  return (
    <main className="pt-safe px-4 pb-32">
      <header className="mb-8 mt-6">
        <h1 className="font-display text-5xl font-extrabold tracking-tight">Listig</h1>
        <p className="mt-2 text-muted">Listor du delar med de du gillar.</p>
      </header>

      {lists && lists.length === 0 && (
        <section className="space-y-3">
          {(Object.keys(LIST_TYPES) as ListType[]).map((t) => (
            <button
              key={t}
              data-type={t}
              onClick={() => (setType(t), setTitle(""), setOpen(true))}
              className="flex w-full items-center gap-4 rounded-3xl border border-line bg-card p-5 text-left transition active:scale-[0.98]"
            >
              <span className="text-3xl">{LIST_TYPES[t].emoji}</span>
              <span>
                <span className="block font-semibold">{LIST_TYPES[t].label}</span>
                <span className="block text-sm text-muted">{LIST_TYPES[t].hint}</span>
              </span>
            </button>
          ))}
        </section>
      )}

      {lists && lists.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">Dina listor</h2>
          <ul className="space-y-2">
            {lists.map((l) => (
              <li key={l.id} data-type={l.type}>
                <Link
                  href={`/l/${l.id}`}
                  className="flex items-center gap-4 rounded-3xl border border-line bg-card p-4 transition active:scale-[0.98]"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl" style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)" }}>
                    {l.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{l.title}</span>
                    <span className="block text-sm" style={{ color: "var(--accent)" }}>
                      {LIST_TYPES[l.type]?.label}
                    </span>
                  </span>
                  <Icon name="back" className="rotate-180 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="pb-safe fixed inset-x-0 bottom-0 flex justify-center px-4">
        <button
          onClick={() => (setTitle(""), setOpen(true))}
          className="flex w-full max-w-xl items-center justify-center gap-2 rounded-full bg-ink py-4 font-semibold text-paper shadow-xl transition active:scale-[0.98]"
        >
          <Icon name="plus" /> Ny lista
        </button>
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} title="Ny lista">
        <form onSubmit={create} className="space-y-4">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Typ av lista">
            {(Object.keys(LIST_TYPES) as ListType[]).map((t) => (
              <button
                type="button"
                key={t}
                data-type={t}
                role="radio"
                aria-checked={type === t}
                onClick={() => setType(t)}
                className={`rounded-2xl border-2 p-3 text-center transition ${type === t ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]" : "border-line"}`}
              >
                <span className="block text-2xl">{LIST_TYPES[t].emoji}</span>
                <span className="mt-1 block text-xs font-semibold">{LIST_TYPES[t].label}</span>
              </button>
            ))}
          </div>
          <p className="text-sm text-muted">{LIST_TYPES[type].hint}</p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={type === "shopping" ? "t.ex. Veckohandling" : type === "wish" ? "t.ex. Min julönskelista" : "t.ex. Ny cykel"}
            maxLength={80}
            className="w-full rounded-2xl border border-line bg-paper px-4 py-3 text-base outline-none focus:border-ink"
          />
          <button
            disabled={busy}
            data-type={type}
            className="w-full rounded-2xl py-4 font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--accent)" }}
          >
            {busy ? "Skapar…" : "Skapa lista"}
          </button>
        </form>
      </Sheet>
    </main>
  );
}
