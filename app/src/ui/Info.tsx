import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/** Contextual explanation: a "?" button opening an accessible popover. */
export function Info({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <span className="info" ref={ref}>
      <button type="button" className="info-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} title={title}>
        ?
      </button>
      {open && (
        <div className="info-pop" id={id} role="dialog" aria-label={title}>
          <div className="info-title">{title}</div>
          {children}
        </div>
      )}
    </span>
  );
}

export function Badge({ kind, children }: { kind: 'exact' | 'partial' | 'warn' | 'info'; children: ReactNode }) {
  return <span className={`badge badge-${kind}`}>{children}</span>;
}
