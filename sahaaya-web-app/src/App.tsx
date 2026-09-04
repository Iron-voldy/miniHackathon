import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSession } from "./lib/SessionContext";
import Login from "./pages/Login";
import Board from "./pages/Board";
import Inbox from "./pages/Inbox";
import CareTeam from "./pages/CareTeam";

type Tab = "board" | "inbox" | "careTeam";

export default function App() {
  const { session, setSession } = useSession();
  const { t, i18n } = useTranslation();
  const [tab, setTab] = useState<Tab>(session?.role === "caregiver" ? "inbox" : "board");

  if (!session) return <Login />;

  const primaryTab: Tab = session.role === "caregiver" ? "inbox" : "board";
  const activeTab = tab === "board" || tab === "inbox" ? primaryTab : tab;

  return (
    <div className="dashboard-shell min-h-screen">
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-teal-800">{t("appName")}</h1>
          <p className="text-xs text-slate-400">
            {session.name} · {session.role}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(["en", "si", "ta"] as const).map((code) => (
            <button
              key={code}
              onClick={() => i18n.changeLanguage(code)}
              className={`px-2.5 py-1 rounded-full text-xs border ${
                i18n.language === code ? "bg-teal-600 text-white border-teal-600" : "border-slate-200 text-slate-500"
              }`}
            >
              {code.toUpperCase()}
            </button>
          ))}
          <button onClick={() => setSession(null)} className="ml-2 text-sm text-slate-500 hover:text-rose-600">
            {t("logout")}
          </button>
        </div>
      </header>

      <nav className="px-4 sm:px-6 pt-4 flex gap-2">
        <TabButton active={activeTab === primaryTab} onClick={() => setTab(primaryTab)}>
          {session.role === "caregiver" ? t("inbox") : t("board")}
        </TabButton>
        <TabButton active={activeTab === "careTeam"} onClick={() => setTab("careTeam")}>
          {t("careTeamTab")}
        </TabButton>
      </nav>

      <main className="p-4 sm:p-6">
        {activeTab === "careTeam" ? (
          <CareTeam session={session} />
        ) : session.role === "caregiver" ? (
          <Inbox session={session} />
        ) : (
          <Board session={session} />
        )}
      </main>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-t-xl text-sm font-medium border-b-2 transition ${
        active ? "border-teal-600 text-teal-700" : "border-transparent text-slate-400 hover:text-slate-600"
      }`}
    >
      {children}
    </button>
  );
}
