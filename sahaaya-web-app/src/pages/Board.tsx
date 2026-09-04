import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError, type BoardDetail, type Phrase, type Session } from "../lib/api";
import { useGestureInput } from "../hooks/useGestureInput";

type Mode = "touch" | "face";
type SendState = "idle" | "sending" | "sent" | "error";

const LANG_FIELD: Record<string, keyof Pick<Phrase, "english" | "sinhala" | "tamil">> = {
  en: "english",
  si: "sinhala",
  ta: "tamil",
};

export default function Board({ session }: { session: Session }) {
  const { t, i18n } = useTranslation();
  const [board, setBoard] = useState<BoardDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("touch");
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [sendState, setSendState] = useState<SendState>("idle");
  const [sendError, setSendError] = useState<string | null>(null);
  const recentRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const boards = await api.listBoards(session.token, "home");
        if (!boards[0]) {
          setLoadError("No boards found — did the backend run `npm run seed`?");
          return;
        }
        const detail = await api.getBoard(session.token, boards[0].id);
        if (!cancelled) setBoard(detail);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : "Could not load the board.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session.token]);

  const phraseLabel = useCallback(
    (phrase: Phrase) => phrase[LANG_FIELD[i18n.language] ?? "english"] || phrase.english,
    [i18n.language]
  );

  function openConfirm(index: number) {
    if (sendState === "sending") return;
    setPendingIndex(index);
    setSendState("idle");
    setSendError(null);
  }

  const handleCancel = useCallback(() => {
    setPendingIndex(null);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (pendingIndex === null || !board) return;
    const phrase = board.phrases[pendingIndex];
    if (!phrase) return;
    setSendState("sending");
    try {
      await api.createRequest(session.token, {
        phraseId: phrase.id,
        inputMode: mode,
        clientRequestId: crypto.randomUUID(),
      });
      recentRef.current = [phrase.id, ...recentRef.current].slice(0, 5);
      setSendState("sent");
      setTimeout(() => {
        setPendingIndex(null);
        setSendState("idle");
      }, 1200);
    } catch (err) {
      setSendState("error");
      setSendError(err instanceof ApiError ? err.message : "Could not send — please try again.");
    }
  }, [pendingIndex, board, mode, session.token]);

  const gesture = useGestureInput({
    // Camera/detection must keep running through the confirm phase too - it
    // used to stop the instant a tile was selected, which killed nod-to-confirm
    // before it ever got a chance to fire.
    enabled: mode === "face",
    itemCount: board?.phrases.length ?? 0,
    onSelect: openConfirm,
    onConfirm: handleConfirm,
    onCancel: handleCancel,
  });

  // Keep the gesture hook's internal "awaiting confirm" state in sync when the
  // modal is dismissed by an on-screen tap rather than a nod/shake - otherwise
  // auto-scan stays frozen and the next gesture is misread as a confirm/cancel.
  useEffect(() => {
    if (pendingIndex === null) gesture.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingIndex, gesture.reset]);

  if (loadError) {
    return <p className="text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-4">{loadError}</p>;
  }
  if (!board) {
    return <p className="text-slate-400">{t("loading")}</p>;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <h2 className="text-xl font-semibold text-slate-800">{board.title}</h2>
        <div className="flex gap-2">
          <ModeButton active={mode === "touch"} onClick={() => setMode("touch")}>
            {t("touchMode")}
          </ModeButton>
          <ModeButton active={mode === "face"} onClick={() => setMode("face")}>
            {t("faceMode")}
          </ModeButton>
        </div>
      </div>

      {mode === "face" && (
        <div className="mb-5 flex items-center gap-4 bg-white border border-slate-200 rounded-2xl p-3">
          <video ref={gesture.videoRef} muted playsInline className="w-28 h-20 rounded-lg bg-slate-900 object-cover" />
          <div className="text-sm">
            <p className="font-medium text-slate-700">{t("faceModeDesc")}</p>
            <p className="text-slate-400 mt-1">{t("cameraPrivacyNote")}</p>
            {gesture.cameraError && <p className="text-rose-600 mt-1">{gesture.cameraError}</p>}
            {!gesture.cameraError && (
              <p className={`mt-1 ${gesture.faceDetected ? "text-teal-600" : "text-amber-600"}`}>
                {gesture.faceDetected ? "Face detected" : "Looking for your face…"}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {board.phrases.map((phrase, index) => (
          <button
            key={phrase.id}
            onClick={() => openConfirm(index)}
            className={`rounded-2xl border p-4 text-center transition shadow-sm ${
              mode === "face" && gesture.highlightedIndex === index && pendingIndex === null
                ? "border-teal-500 ring-2 ring-teal-300 bg-teal-50"
                : "border-slate-200 bg-white hover:border-teal-300"
            }`}
          >
            <span className="block text-[10px] uppercase tracking-wide text-slate-400 mb-1">{phrase.category}</span>
            <span className="font-medium text-slate-800">{phraseLabel(phrase)}</span>
          </button>
        ))}
      </div>

      {pendingIndex !== null && board.phrases[pendingIndex] && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center shadow-xl">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">{t("confirm")}?</h3>
            <p className="text-2xl font-bold text-teal-700 mb-4">{phraseLabel(board.phrases[pendingIndex])}</p>
            {sendState === "error" && <p className="text-sm text-rose-600 mb-3">{sendError}</p>}
            {sendState === "sent" ? (
              <p className="text-teal-600 font-medium">{t("sent")}</p>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={handleCancel}
                  disabled={sendState === "sending"}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600"
                >
                  {t("cancel")}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={sendState === "sending"}
                  className="flex-1 py-2.5 rounded-xl bg-teal-600 text-white font-semibold disabled:opacity-60"
                >
                  {sendState === "sending" ? t("sending") : t("speakAndSend")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-sm font-medium border transition ${
        active ? "bg-teal-600 text-white border-teal-600" : "border-slate-200 text-slate-600 hover:border-teal-300"
      }`}
    >
      {children}
    </button>
  );
}
