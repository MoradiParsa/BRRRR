"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  duplicateDeal as makeDuplicate,
  emptyDealState,
  loadDeals,
  makeSavedDeal,
  saveDeals,
  type DealState,
  type SavedDeal,
} from "@/lib/deals";
import { Dashboard } from "@/components/Dashboard";
import { Analyzer } from "@/components/Analyzer";
import { Compare } from "@/components/Compare";
import { ComingSoon } from "@/components/ComingSoon";

type View = "dashboard" | "analyzer" | "compare" | "portfolio" | "settings";

type NavItem = { key: View; label: string; icon: ReactNode };

const NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: <IconGrid /> },
  { key: "analyzer", label: "Deal Analyzer", icon: <IconCalc /> },
  { key: "compare", label: "Compare Deals", icon: <IconCompare /> },
  { key: "portfolio", label: "Portfolio", icon: <IconChart /> },
  { key: "settings", label: "Settings", icon: <IconGear /> },
];

export default function Home() {
  const [deals, setDeals] = useState<SavedDeal[]>([]);
  const [currentDealId, setCurrentDealId] = useState<string | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [ready, setReady] = useState(false);

  // Load saved deals on mount (client only — keeps SSR/hydration consistent).
  useEffect(() => {
    setDeals(loadDeals());
    setReady(true);
  }, []);

  const currentDeal = useMemo(
    () => deals.find((d) => d.id === currentDealId) ?? null,
    [deals, currentDealId],
  );

  // Stable persister for the analyzer's autosave.
  const persistDeal = useCallback(
    (id: string, state: DealState, savedAt: number) => {
      setDeals((prev) => {
        const next = prev.map((d) =>
          d.id === id ? { ...d, ...state, savedAt } : d,
        );
        saveDeals(next);
        return next;
      });
    },
    [],
  );

  const openDeal = (id: string) => {
    setCurrentDealId(id);
    setView("analyzer");
  };

  const newDeal = () => {
    const deal = makeSavedDeal(emptyDealState());
    setDeals((prev) => {
      const next = [deal, ...prev];
      saveDeals(next);
      return next;
    });
    setCurrentDealId(deal.id);
    setView("analyzer");
  };

  const onDuplicate = (id: string) => {
    setDeals((prev) => {
      const src = prev.find((d) => d.id === id);
      if (!src) return prev;
      const next = [makeDuplicate(src), ...prev];
      saveDeals(next);
      return next;
    });
  };

  const onDelete = (id: string) => {
    setDeals((prev) => {
      const next = prev.filter((d) => d.id !== id);
      saveDeals(next);
      return next;
    });
    if (currentDealId === id) {
      setCurrentDealId(null);
      setView("dashboard");
    }
  };

  const navigate = (next: View) => {
    if (next === "analyzer") {
      if (currentDeal) {
        setView("analyzer");
      } else if (deals.length > 0) {
        const recent = [...deals].sort((a, b) => b.savedAt - a.savedAt)[0];
        openDeal(recent.id);
      } else {
        newDeal();
      }
      return;
    }
    setView(next);
  };

  const activeNav: View = view;

  let content: ReactNode = null;
  if (ready) {
    if (view === "analyzer" && currentDeal) {
      content = (
        <Analyzer
          key={currentDeal.id}
          deal={currentDeal}
          initialSavedAt={currentDeal.savedAt}
          onPersist={(state, savedAt) =>
            persistDeal(currentDeal.id, state, savedAt)
          }
          onBack={() => setView("dashboard")}
        />
      );
    } else if (view === "compare") {
      content = <Compare deals={deals} onOpen={openDeal} />;
    } else if (view === "portfolio") {
      content = (
        <ComingSoon
          title="Portfolio"
          description="Roll up every property you own into one view — total equity, monthly cash flow, and portfolio-level performance."
        />
      );
    } else if (view === "settings") {
      content = (
        <ComingSoon
          title="Settings"
          description="Defaults, assumption profiles, and data management will live here."
        />
      );
    } else {
      content = (
        <Dashboard
          deals={deals}
          onOpen={openDeal}
          onNew={newDeal}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      );
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile top nav */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
        <Brand />
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => navigate(item.key)}
              className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                activeNav === item.key
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="lg:flex">
        {/* Desktop sidebar */}
        <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-slate-200 lg:bg-white">
          <div className="flex h-16 items-center border-b border-slate-100 px-6">
            <Brand />
          </div>
          <nav className="flex-1 space-y-1 px-3 py-4">
            {NAV.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => navigate(item.key)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  activeNav === item.key
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span
                  className={
                    activeNav === item.key ? "text-indigo-600" : "text-slate-400"
                  }
                >
                  {item.icon}
                </span>
                {item.label}
              </button>
            ))}
          </nav>
          <div className="border-t border-slate-100 px-6 py-4 text-[11px] text-slate-400">
            Saved locally in this browser
          </div>
        </aside>

        {/* Main content */}
        <div className="min-w-0 flex-1">{content}</div>
      </div>
    </div>
  );
}

/* --------------------------------- brand ---------------------------------- */

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-sm font-extrabold text-white">
        B
      </span>
      <span className="text-base font-bold tracking-tight text-slate-900">
        BRRRR<span className="text-indigo-600"> AI</span>
      </span>
    </div>
  );
}

/* --------------------------------- icons ---------------------------------- */

function IconGrid() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
      <path d="M3 3h6v6H3V3zm8 0h6v6h-6V3zM3 11h6v6H3v-6zm8 0h6v6h-6v-6z" />
    </svg>
  );
}
function IconCalc() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M5 2a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V4a2 2 0 00-2-2H5zm1 3h8v2H6V5zm0 4h2v2H6V9zm0 4h2v2H6v-2zm4-4h2v2h-2V9zm0 4h2v2h-2v-2zm4-4h2v6h-2V9z"
        clipRule="evenodd"
      />
    </svg>
  );
}
function IconCompare() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
      <path d="M9 2h2v16H9V2zM4 6h3v10H4V6zm9 3h3v7h-3V9z" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
      <path d="M3 3a1 1 0 011 1v11h12a1 1 0 110 2H4a2 2 0 01-2-2V4a1 1 0 011-1z" />
      <path d="M7 11l3-3 2 2 4-4v5H7z" />
    </svg>
  );
}
function IconGear() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.53 1.53 0 01-2.29.95c-1.37-.84-2.94.73-2.1 2.1a1.53 1.53 0 01-.95 2.29c-1.56.38-1.56 2.6 0 2.98a1.53 1.53 0 01.95 2.29c-.84 1.37.73 2.94 2.1 2.1a1.53 1.53 0 012.29.95c.38 1.56 2.6 1.56 2.98 0a1.53 1.53 0 012.29-.95c1.37.84 2.94-.73 2.1-2.1a1.53 1.53 0 01.95-2.29c1.56-.38 1.56-2.6 0-2.98a1.53 1.53 0 01-.95-2.29c.84-1.37-.73-2.94-2.1-2.1a1.53 1.53 0 01-2.29-.95zM10 13a3 3 0 100-6 3 3 0 000 6z"
        clipRule="evenodd"
      />
    </svg>
  );
}
