import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError, type Session } from "../lib/api";

interface LinkRow {
  id: string;
  communicator: { name: string } | null;
  caregiver: { name: string } | null;
}

export default function CareTeam({ session }: { session: Session }) {
  const { t } = useTranslation();
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [message, setMessage] = useState<{ text: string; kind: "success" | "error" } | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadLinks() {
    try {
      const rows = await api.listCaregivers(session.token);
      setLinks(rows);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load your care team.");
    }
  }

  useEffect(() => {
    loadLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.token]);

  async function handleGenerateCode() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.createPairing(session.token);
      setPairingCode(result.pairingCode);
    } catch (err) {
      setMessage({ text: err instanceof ApiError ? err.message : "Could not generate a code.", kind: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function handleAcceptCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api.acceptPairing(session.token, codeInput.trim());
      setMessage({ text: t("pairedSuccessfully"), kind: "success" });
      setCodeInput("");
      await loadLinks();
    } catch (err) {
      setMessage({ text: err instanceof ApiError ? err.message : t("invalidPairingCode"), kind: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-lg">
      {session.role === "communicator" ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-6">
          <button
            onClick={handleGenerateCode}
            disabled={busy}
            className="w-full py-2.5 rounded-xl bg-teal-600 text-white font-semibold disabled:opacity-60"
          >
            {t("generatePairingCode")}
          </button>
          {pairingCode && (
            <p className="text-center text-3xl font-bold tracking-widest text-teal-700 mt-4">{pairingCode}</p>
          )}
        </div>
      ) : (
        <form onSubmit={handleAcceptCode} className="bg-white border border-slate-200 rounded-2xl p-5 mb-6 space-y-3">
          <label className="block text-sm font-medium text-slate-600">{t("enterPairingCode")}</label>
          <input
            required
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 tracking-widest uppercase"
            placeholder="ABC123"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 rounded-xl bg-teal-600 text-white font-semibold disabled:opacity-60"
          >
            {t("acceptPairing")}
          </button>
        </form>
      )}

      {message && (
        <p
          className={`text-sm rounded-lg px-3 py-2 mb-4 ${
            message.kind === "success" ? "text-teal-700 bg-teal-50 border border-teal-100" : "text-rose-600 bg-rose-50 border border-rose-100"
          }`}
        >
          {message.text}
        </p>
      )}

      {loadError && <p className="text-rose-600 mb-4">{loadError}</p>}

      <div className="space-y-2">
        {links.length === 0 && !loadError && <p className="text-slate-400 text-sm">{t("noActiveCaregiver")}</p>}
        {links.map((link) => (
          <div key={link.id} className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm">
            {link.communicator?.name ?? "?"} ↔ {link.caregiver?.name ?? "(pending)"}
          </div>
        ))}
      </div>
    </div>
  );
}
