import { FormEvent, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api } from "../../shared/api";
import { useI18n } from "../../shared/i18n";

export function SetupView({ onComplete }: { onComplete: () => void }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const { t } = useI18n();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    api
      .createAdmin({ username, email, password })
      .then(onComplete)
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setSaving(false));
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="setup-title">
        <div className="auth-mark">
          <ShieldCheck size={30} aria-hidden="true" />
        </div>
        <h1 id="setup-title">{t("setup.title")}</h1>
        <p>{t("setup.subtitle")}</p>

        <form className="auth-form" onSubmit={submit}>
          <label>
            {t("auth.username")}
            <input
              value={username}
              minLength={3}
              autoComplete="username"
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>

          <label>
            {t("auth.email")}
            <input
              type="email"
              value={email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label>
            {t("auth.password")}
            <input
              type="password"
              value={password}
              minLength={12}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          <button className="primary-button" disabled={saving}>
            {saving ? t("setup.saving") : t("setup.submit")}
          </button>

          {message && <p className="form-message">{message}</p>}
        </form>
      </section>
    </main>
  );
}
