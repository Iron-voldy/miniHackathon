import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError, type RequestRecord, type Session } from "../lib/api";

export default function Inbox({ session }: { session: Session }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Record<string, RequestRecord>>({});
  const [streamError, setStreamError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .subscribeInbox(
        session.token,
        (item) => {
          setItems((prev) => ({ ...prev, [item.id]: item }));
          setStreamError(null);
        },
        controller.signal
      )
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setStreamError(err instanceof ApiError ? err.message : "Lost connection to the live inbox.");
      });
    return () => controller.abort();
  }, [session.token]);

  async function handleAcknowledge(id: string) {
    setBusyId(id);
    try {
      const updated = await api.acknowledgeRequest(session.token, id);
      setItems((prev) => ({ ...prev, [id]: updated }));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Could not acknowledge — please try again.");
    } finally {
      setBusyId(null);
    }
  }

  const list = Object.values(items).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return (
    <div className="max-w-2xl">
      {streamError && <p className="text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-3 mb-4">{streamError}</p>}
      {list.length === 0 ? (
        <p className="text-slate-400">{t("noPendingRequests")}</p>
      ) : (
        <div className="space-y-3">
          {list.map((item) => {
            const canAck = item.status === "pending" || item.status === "delivered";
            return (
              <div
                key={item.id}
                className="dashboard-enter bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-4"
              >
                <div>
                  <p className="text-lg font-semibold text-slate-800">{item.resolvedText}</p>
                  <StatusBadge status={item.status} />
                </div>
                {canAck && (
                  <button
                    onClick={() => handleAcknowledge(item.id)}
                    disabled={busyId === item.id}
                    className="px-4 py-2 rounded-xl bg-teal-600 text-white text-sm font-medium disabled:opacity-60 shrink-0"
                  >
                    {t("acknowledge")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "seen" || status === "completed"
      ? "bg-teal-50 text-teal-700"
      : status === "cancelled" || status === "failed"
      ? "bg-rose-50 text-rose-600"
      : "bg-slate-100 text-slate-600";
  return <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full uppercase tracking-wide ${tone}`}>{status}</span>;
}
