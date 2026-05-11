import { FormEvent, useState } from "react";
import { api, Session } from "../../shared/api";

export function LoginView({ onLogin }: { onLogin: (session: Session) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [saving, setSaving] = useState(false);

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

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <img className="auth-logo" src="/brand/railkeeper-logo.png" alt="RailKeeper" />
        <h1 id="login-title">RailKeeper Anmelden</h1>
        <p>Melden Sie sich an Ihrem Konto an</p>

        <form className="auth-form" onSubmit={submit}>
          <label>
            Benutzername
            <input
              value={username}
              autoComplete="username"
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>

          <label>
            Passwort
            <input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          <button
            type="button"
            className="forgot-password-button"
            onClick={() => setRecoveryMessage("Bitte wenden Sie sich an den Administrator, um das Passwort zurückzusetzen.")}
          >
            Passwort vergessen?
          </button>

          <button className="primary-button" disabled={saving}>
            {saving ? "Wird angemeldet..." : "Anmelden"}
          </button>

          {recoveryMessage && <p className="auth-hint">{recoveryMessage}</p>}
          {message && <p className="form-message">{message}</p>}
        </form>
      </section>
    </main>
  );
}
