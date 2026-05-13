import { FormEvent, useState } from "react";
import { api, Session } from "../../shared/api";
import { useI18n } from "../../shared/i18n";

export function LoginView({ onLogin }: { onLogin: (session: Session) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const { t } = useI18n();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setRecoveryMessage("");

    api
      .login({ username, password })
      .then(onLogin)
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setSaving(false));
  };

  const requestReset = () => {
    setSaving(true);
    setMessage("");
    setRecoveryMessage("");

    api
      .requestPasswordReset({ email: resetEmail })
      .then((result) => setRecoveryMessage(result.message || t("auth.recovery.requested")))
      .catch((error: Error) => setRecoveryMessage(error.message))
      .finally(() => setSaving(false));
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <img className="auth-logo" src="/brand/railkeeper-logo.png" alt="RailKeeper" />
        <h1 id="login-title">{t("auth.login.title")}</h1>
        <p>{t("auth.login.subtitle")}</p>

        <form className="auth-form" onSubmit={submit}>
          <label>
            {t("auth.username")}
            <input
              value={username}
              autoComplete="username"
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>

          <label>
            {t("auth.password")}
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          <button className="primary-button" disabled={saving}>
            {saving ? t("auth.login.saving") : t("auth.login.submit")}
          </button>

          <button
            type="button"
            className="forgot-password-button"
            onClick={() => {
              setResetOpen((current) => !current);
              setRecoveryMessage("");
            }}
          >
            {t("auth.forgot")}
          </button>

          {resetOpen && (
            <div className="password-reset-form">
              <label>
                {t("auth.email")}
                <input
                  type="email"
                  value={resetEmail}
                  autoComplete="email"
                  onChange={(event) => setResetEmail(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      requestReset();
                    }
                  }}
                  required
                />
              </label>
              <button type="button" className="secondary-button" onClick={requestReset} disabled={saving || !resetEmail.trim()}>
                {t("auth.recovery.submit")}
              </button>
            </div>
          )}

          {recoveryMessage && <p className="auth-hint">{recoveryMessage}</p>}
          {message && <p className="form-message">{message}</p>}
        </form>
      </section>
    </main>
  );
}
