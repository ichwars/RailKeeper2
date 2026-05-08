import { FormEvent, useState } from "react";
import { LogIn } from "lucide-react";
import { api, Session } from "../../shared/api";

export function LoginView({ onLogin }: { onLogin: (session: Session) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    api
      .login({ username, password })
      .then(onLogin)
      .catch((error: Error) => setMessage(error.message))
      .finally(() => setSaving(false));
  };

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <div className="auth-mark">
          <LogIn size={30} aria-hidden="true" />
        </div>
        <h1 id="login-title">Anmelden</h1>
        <p>Melde dich an, um RailKeeper2 zu oeffnen.</p>

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

          <button className="primary-button" disabled={saving}>
            {saving ? "Wird angemeldet..." : "Anmelden"}
          </button>

          {message && <p className="form-message">{message}</p>}
        </form>
      </section>
    </main>
  );
}
