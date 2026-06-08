"use client";

export type CheckStatus = "good" | "warn" | "bad";

export type ChecklistItem = {
  label: string;
  status: CheckStatus;
  detail: string;
};

const style: Record<
  CheckStatus,
  { ring: string; icon: string; text: string }
> = {
  good: { ring: "bg-emerald-500", icon: "check", text: "text-slate-700" },
  warn: { ring: "bg-amber-500", icon: "warn", text: "text-slate-700" },
  bad: { ring: "bg-red-500", icon: "x", text: "text-slate-700" },
};

function Icon({ kind }: { kind: string }) {
  if (kind === "check") {
    return (
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M16.7 5.3a1 1 0 010 1.4l-7 7a1 1 0 01-1.4 0l-3-3a1 1 0 011.4-1.4l2.3 2.29 6.3-6.3a1 1 0 011.4 0z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  if (kind === "x") {
    return (
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M6.3 6.3a1 1 0 011.4 0L10 8.6l2.3-2.3a1 1 0 111.4 1.4L11.4 10l2.3 2.3a1 1 0 01-1.4 1.4L10 11.4l-2.3 2.3a1 1 0 01-1.4-1.4L8.6 10 6.3 7.7a1 1 0 010-1.4z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M8.26 3.1c.77-1.33 2.71-1.33 3.48 0l6.28 10.86c.77 1.33-.2 3-1.74 3H3.72c-1.54 0-2.5-1.67-1.74-3L8.26 3.1zM10 7a1 1 0 00-1 1v3a1 1 0 102 0V8a1 1 0 00-1-1zm0 7a1 1 0 100 2 1 1 0 000-2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function DealChecklist({ items }: { items: ChecklistItem[] }) {
  const passed = items.filter((i) => i.status === "good").length;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Property Checklist
        </h2>
        <span className="text-xs font-medium text-slate-500">
          {passed}/{items.length} passing
        </span>
      </div>
      <ul className="space-y-2.5">
        {items.map((it) => {
          const st = style[it.status];
          return (
            <li key={it.label} className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white ${st.ring}`}
              >
                <Icon kind={st.icon} />
              </span>
              <div className="min-w-0">
                <div className={`text-sm font-medium ${st.text}`}>{it.label}</div>
                <div className="text-xs leading-relaxed text-slate-500">
                  {it.detail}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
