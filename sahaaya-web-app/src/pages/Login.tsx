import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError, type Role } from "../lib/api";
import { useSession } from "../lib/SessionContext";

const LANGUAGES: Array<{ code: "en" | "si" | "ta"; label: string }> = [
  { code: "en", label: "EN" },
  { code: "si", label: "සිං" },
  { code: "ta", label: "தமிழ்" },
];

type CaregiverMode = "login" | "signup";

export default function Login() {
  const { t, i18n } = useTranslation();
  const { setSession } = useSession();

  const [role, setRole] = useState<Role>("communicator");
  const [caregiverMode, setCaregiverMode] = useState<CaregiverMode>("login");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const session =
        role === "communicator"
          ? await api.patientLogin(code.trim())
          : caregiverMode === "login"
          ? await api.login({ email: email.trim(), password })
          : await api.signup({ name: name.trim(), phone: phone.trim(), email: email.trim(), password });
      setSession(session);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const caregiverSignup = role === "caregiver" && caregiverMode === "signup";
  const submitLabel =
    role === "communicator"
      ? submitting
        ? t("loggingIn")
        : t("login")
      : caregiverMode === "login"
      ? submitting
        ? t("loggingIn")
        : t("logIn")
      : submitting
      ? t("signingUp")
      : t("createAccount");

  return (
    <div className="login-shell min-h-screen flex items-center justify-center p-4">
      <div className="login-orb login-orb-one" />
      <div className="login-orb login-orb-two" />

      <div className="login-panel relative w-full max-w-4xl bg-white/90 backdrop-blur rounded-3xl shadow-xl overflow-hidden grid md:grid-cols-2">
        <div className="hidden md:flex flex-col justify-between bg-teal-700 text-white p-8">
          <div>
            <h1 className="text-3xl font-bold">{t("appName")}</h1>
            <p className="text-teal-100 mt-1">{t("tagline")}</p>
          </div>
          <img
            src="/sahaaya-login-hero.png"
            alt=""
            className="rounded-2xl mt-6 max-h-64 object-cover w-full"
          />
          <p className="text-sm text-teal-100 mt-6 border-l-2 border-teal-300 pl-3">{t("problemBlurb")}</p>
        </div>

        <div className="login-content p-8">
          <div className="flex justify-between items-center mb-6 md:hidden">
            <h1 className="text-2xl font-bold text-teal-800">{t("appName")}</h1>
          </div>

          <div className="flex gap-2 justify-end mb-4">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => i18n.changeLanguage(l.code)}
                className={`px-3 py-1 rounded-full text-sm border transition ${
                  i18n.language === l.code
                    ? "bg-teal-600 text-white border-teal-600"
                    : "border-slate-200 text-slate-500 hover:border-teal-400"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 mb-6">
            <button
              type="button"
              onClick={() => {
                setRole("communicator");
                setError(null);
              }}
              className={`py-3 rounded-xl border text-sm font-medium transition ${
                role === "communicator"
                  ? "bg-teal-600 text-white border-teal-600 shadow"
                  : "border-slate-200 text-slate-600 hover:border-teal-300"
              }`}
            >
              {t("iAmCommunicator")}
            </button>
            <button
              type="button"
              onClick={() => {
                setRole("caregiver");
                setError(null);
              }}
              className={`py-3 rounded-xl border text-sm font-medium transition ${
                role === "caregiver"
                  ? "bg-teal-600 text-white border-teal-600 shadow"
                  : "border-slate-200 text-slate-600 hover:border-teal-300"
              }`}
            >
              {t("iAmCaregiver")}
            </button>
          </div>

          {role === "caregiver" && (
            <div className="flex gap-2 justify-center mb-5 text-sm">
              <button
                type="button"
                onClick={() => {
                  setCaregiverMode("login");
                  setError(null);
                }}
                className={`px-3 py-1.5 rounded-full transition ${
                  caregiverMode === "login" ? "font-semibold text-teal-700 underline" : "text-slate-400"
                }`}
              >
                {t("logIn")}
              </button>
              <span className="text-slate-300">·</span>
              <button
                type="button"
                onClick={() => {
                  setCaregiverMode("signup");
                  setError(null);
                }}
                className={`px-3 py-1.5 rounded-full transition ${
                  caregiverMode === "signup" ? "font-semibold text-teal-700 underline" : "text-slate-400"
                }`}
              >
                {t("createAccount")}
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {role === "communicator" && (
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">{t("yourAccessCode")}</label>
                <input
                  required
                  minLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-2xl tracking-[0.2em] uppercase focus:border-teal-500 outline-none"
                  placeholder="XXXX-XXXX"
                  autoFocus
                  inputMode="text"
                  autoComplete="one-time-code"
                />
                <p className="text-xs text-slate-400 mt-1">{t("accessCodeHelp")}</p>
              </div>
            )}

            {caregiverSignup && (
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">{t("yourName")}</label>
                <input
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 focus:border-teal-500 outline-none"
                  placeholder="Kasun"
                />
              </div>
            )}

            {caregiverSignup && (
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">{t("yourPhone")}</label>
                <input
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 focus:border-teal-500 outline-none"
                  placeholder="077 123 4567"
                />
              </div>
            )}

            {role === "caregiver" && (
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">{t("yourEmail")}</label>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 focus:border-teal-500 outline-none"
                  placeholder="you@example.com"
                />
                {caregiverSignup && <p className="text-xs text-slate-400 mt-1">{t("emailHelpCaregiver")}</p>}
              </div>
            )}

            {role === "caregiver" && (
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">{t("yourPassword")}</label>
                <input
                  required
                  minLength={8}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 focus:border-teal-500 outline-none"
                  placeholder="••••••••"
                  autoComplete={caregiverMode === "login" ? "current-password" : "new-password"}
                />
              </div>
            )}

            {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 disabled:opacity-60 transition"
            >
              {submitLabel}
            </button>
          </form>

          <p className="text-xs text-slate-400 mt-6 md:hidden">{t("problemBlurb")}</p>
        </div>
      </div>
    </div>
  );
}
