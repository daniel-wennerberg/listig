import { useEffect, useState, type ReactNode } from "react";
import { getName, setName } from "../lib";

export function Sheet({ open, onClose, children, title }: { open: boolean; onClose: () => void; children: ReactNode; title?: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center animate-fade" role="dialog" aria-modal="true">
      <button aria-label="Stäng" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="animate-sheet pb-safe relative w-full max-w-xl rounded-t-3xl bg-card px-5 pt-3 shadow-2xl">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" />
        {title && <h2 className="font-display mb-4 text-xl font-semibold">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function Toast({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div className="animate-fade fixed inset-x-0 bottom-24 z-50 flex justify-center px-4" role="status">
      <div className="rounded-full bg-ink px-4 py-2 text-sm text-paper shadow-lg">{msg}</div>
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), 2200);
    return () => clearTimeout(t);
  }, [msg]);
  return [msg, setMsg] as const;
}

/** Ber om ett namn första gången, så alla ser vem som bockat av/kommenterat. */
export function useName() {
  const [name, setNameState] = useState<string | null>(null);
  useEffect(() => setNameState(getName()), []);
  return [name, (n: string) => (setName(n), setNameState(n.trim()))] as const;
}

export function NameSheet({ open, onSave, onClose }: { open: boolean; onSave: (n: string) => void; onClose: () => void }) {
  const [v, setV] = useState("");
  return (
    <Sheet open={open} onClose={onClose} title="Vad heter du?">
      <p className="mb-4 text-sm text-muted">Så att andra ser vem som bockat av, reserverat eller kommenterat.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (v.trim()) onSave(v.trim());
        }}
        className="flex gap-2"
      >
        <input
          autoFocus
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder="Ditt namn"
          maxLength={40}
          className="min-w-0 flex-1 rounded-2xl border border-line bg-paper px-4 py-3 text-base outline-none focus:border-ink"
        />
        <button className="rounded-2xl bg-ink px-5 font-semibold text-paper disabled:opacity-40" disabled={!v.trim()}>
          Klar
        </button>
      </form>
    </Sheet>
  );
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ width: size, height: size, background: `hsl(${hue} 55% 48%)` }}
      aria-hidden
    >
      {(name || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}

const paths: Record<string, ReactNode> = {
  back: <path d="M15 18l-6-6 6-6" />,
  share: (
    <>
      <path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7" />
      <path d="M16 6l-4-4-4 4M12 2v14" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  chat: <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />,
  link: (
    <>
      <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />
    </>
  ),
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>
  ),
  star: <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />,
  gift: (
    <>
      <path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13" />
      <path d="M12 7S10.5 3 8 3.5 7.5 7 12 7zM12 7s1.5-4 4-3.5S16.5 7 12 7z" />
    </>
  ),
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </>
  ),
  send: <path d="M4 12l16-8-6 16-2.5-6.5z" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
};

export function Icon({ name, size = 20, className = "", fill = false }: { name: keyof typeof paths | string; size?: number; className?: string; fill?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={name === "more" ? 3 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {paths[name]}
    </svg>
  );
}

export function Thumb({ src, alt, size = 56 }: { src: string; alt: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (!src || err)
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-xl bg-paper text-lg text-muted"
        style={{ width: size, height: size }}
        aria-hidden
      >
        {alt.slice(0, 1).toUpperCase()}
      </div>
    );
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      onError={() => setErr(true)}
      className="shrink-0 rounded-xl bg-white object-contain"
      style={{ width: size, height: size }}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}
