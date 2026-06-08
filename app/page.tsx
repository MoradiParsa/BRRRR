"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  duplicateDeal as makeDuplicate,
  emptyDealState,
  loadDeals,
  makeSavedDeal,
  saveDeals,
  toDealState,
  type DealState,
  type SavedDeal,
} from "@/lib/deals";
import { DashboardHome } from "@/components/DashboardHome";
import { SavedDeals } from "@/components/SavedDeals";
import { Workspace, type WorkspaceHandle } from "@/components/Workspace";
import { Compare } from "@/components/Compare";
import { ImportProperty } from "@/components/ImportProperty";
import { ComingSoon } from "@/components/ComingSoon";

type View =
  | "dashboard"
  | "import"
  | "saved"
  | "compare"
  | "portfolio"
  | "settings";

type NavItem = { key: View; label: string; icon: ReactNode };

const NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", icon: <IconGrid /> },
  { key: "import", label: "Add Property", icon: <IconImport /> },
  { key: "saved", label: "Saved Deals", icon: <IconStack /> },
  { key: "compare", label: "Compare Deals", icon: <IconCompare /> },
  { key: "portfolio", label: "Portfolio", icon: <IconChart /> },
  { key: "settings", label: "Settings", icon: <IconGear /> },
];

type WorkspaceInit = {
  mode: "new" | "edit";
  dealId: string | null;
  deal: DealState;
  savedAt: number | null;
  returnView: View;
};

export default function Home() {
  const [deals, setDeals] = useState<SavedDeal[]>([]);
  const [view, setView] = useState<View>("dashboard");
  const [ready, setReady] = useState(false);

  // Workspace (analyzer) — only active when creating or opening a deal.
  const [workspace, setWorkspace] = useState<WorkspaceInit | null>(null);
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const [workspaceDirty, setWorkspaceDirty] = useState(false);
  const workspaceRef = useRef<WorkspaceHandle>(null);
  const inWorkspace = workspace !== null;

  // Unsaved-changes modal state.
  const [pendingNav, setPendingNav] = useState<View | null>(null);

  useEffect(() => {
    setDeals(loadDeals());
    setReady(true);
  }, []);

  /* ----------------------------- persistence ----------------------------- */

  const onPersistNew = useCallback((state: DealState): string => {
    const deal = makeSavedDeal(state);
    setDeals((prev) => {
      const next = [deal, ...prev];
      saveDeals(next);
      return next;
    });
    return deal.id;
  }, []);

  const onPersistExisting = useCallback((id: string, state: DealState) => {
    setDeals((prev) => {
      const next = prev.map((d) =>
        d.id === id ? { ...d, ...state, savedAt: Date.now() } : d,
      );
      saveDeals(next);
      return next;
    });
  }, []);

  const onDirtyChange = useCallback((dirty: boolean) => {
    setWorkspaceDirty(dirty);
  }, []);

  /* ------------------------------- opening ------------------------------- */

  const openNew = () => {
    setWorkspace({
      mode: "new",
      dealId: null,
      deal: emptyDealState(),
      savedAt: null,
      returnView: view,
    });
    setWorkspaceKey((k) => k + 1);
    setWorkspaceDirty(false);
  };

  const openEdit = (id: string) => {
    const d = deals.find((x) => x.id === id);
    if (!d) return;
    setWorkspace({
      mode: "edit",
      dealId: id,
      deal: toDealState(d),
      savedAt: d.savedAt,
      returnView: view === "compare" ? "compare" : view,
    });
    setWorkspaceKey((k) => k + 1);
    setWorkspaceDirty(false);
  };

  // Open the workspace with an imported (or blank) draft — an unsaved new deal.
  const openDraft = (deal: DealState) => {
    setWorkspace({
      mode: "new",
      dealId: null,
      deal,
      savedAt: null,
      returnView: "import",
    });
    setWorkspaceKey((k) => k + 1);
    setWorkspaceDirty(false);
  };

  // CSV import: persist every parsed row, then open the first in the workspace.
  const importDeals = (states: DealState[]) => {
    if (states.length === 0) return;
    const saved = states.map(makeSavedDeal);
    setDeals((prev) => {
      const next = [...saved, ...prev];
      saveDeals(next);
      return next;
    });
    const first = saved[0];
    setWorkspace({
      mode: "edit",
      dealId: first.id,
      deal: toDealState(first),
      savedAt: first.savedAt,
      returnView: "saved",
    });
    setWorkspaceKey((k) => k + 1);
    setWorkspaceDirty(false);
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
  };

  /* ----------------------------- navigation ------------------------------ */

  const leaveWorkspace = (target: View) => {
    setWorkspace(null);
    setWorkspaceDirty(false);
    setView(target);
  };

  // Navigate, guarding unsaved workspace changes.
  const requestNavigate = (target: View) => {
    if (inWorkspace && workspaceDirty) {
      setPendingNav(target);
      return;
    }
    if (inWorkspace) {
      leaveWorkspace(target);
    } else {
      setView(target);
    }
  };

  const modalCancel = () => setPendingNav(null);
  const modalDiscard = () => {
    const target = pendingNav;
    setPendingNav(null);
    if (target) leaveWorkspace(target);
  };
  const modalSaveAndLeave = () => {
    const target = pendingNav;
    workspaceRef.current?.save();
    setPendingNav(null);
    if (target) leaveWorkspace(target);
  };

  /* ------------------------------- content ------------------------------- */

  let content: ReactNode = null;
  if (ready) {
    if (inWorkspace && workspace) {
      content = (
        <Workspace
          key={workspaceKey}
          ref={workspaceRef}
          deal={workspace.deal}
          mode={workspace.mode}
          dealId={workspace.dealId}
          initialSavedAt={workspace.savedAt}
          onPersistNew={onPersistNew}
          onPersistExisting={onPersistExisting}
          onDirtyChange={onDirtyChange}
          onBack={() => requestNavigate(workspace.returnView)}
        />
      );
    } else if (view === "import") {
      content = (
        <ImportProperty
          onCreateDraft={openDraft}
          onImportDeals={importDeals}
        />
      );
    } else if (view === "saved") {
      content = (
        <SavedDeals
          deals={deals}
          onOpen={openEdit}
          onNew={openNew}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      );
    } else if (view === "compare") {
      content = <Compare deals={deals} onOpen={openEdit} />;
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
        <DashboardHome
          deals={deals}
          onNew={openNew}
          onOpen={openEdit}
          onViewAll={() => requestNavigate("saved")}
        />
      );
    }
  }

  const activeNav: View | null = inWorkspace ? null : view;

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
              onClick={() => requestNavigate(item.key)}
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
                onClick={() => requestNavigate(item.key)}
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

      {/* Unsaved-changes modal */}
      {pendingNav && (
        <LeaveModal
          onCancel={modalCancel}
          onDiscard={modalDiscard}
          onSave={modalSaveAndLeave}
        />
      )}
    </div>
  );
}

/* ------------------------------- leave modal ------------------------------ */

function LeaveModal({
  onCancel,
  onDiscard,
  onSave,
}: {
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M8.26 3.1c.77-1.33 2.71-1.33 3.48 0l6.28 10.86c.77 1.33-.2 3-1.74 3H3.72c-1.54 0-2.5-1.67-1.74-3L8.26 3.1zM10 7a1 1 0 00-1 1v3a1 1 0 102 0V8a1 1 0 00-1-1zm0 7a1 1 0 100 2 1 1 0 000-2z"
                clipRule="evenodd"
              />
            </svg>
          </span>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              You have unsaved changes
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Save before leaving, or discard your changes?
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={onSave}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            Save &amp; Leave
          </button>
        </div>
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
function IconStack() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
      <path d="M10 1l9 4-9 4-9-4 9-4z" />
      <path d="M1 9l9 4 9-4M1 13l9 4 9-4" opacity="0.5" />
    </svg>
  );
}
function IconImport() {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor">
      <path d="M10 2a1 1 0 011 1v6.59l1.3-1.3a1 1 0 011.4 1.42l-3 3a1 1 0 01-1.4 0l-3-3a1 1 0 011.4-1.42l1.3 1.3V3a1 1 0 011-1z" />
      <path d="M3 13a1 1 0 011 1v2h12v-2a1 1 0 112 0v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2a1 1 0 011-1z" />
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
