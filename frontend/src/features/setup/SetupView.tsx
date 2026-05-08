import { FormEvent, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api } from "../../shared/api";

export function SetupView({ onComplete }: { onComplete: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    api
      .createAdmin({ username, password })
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
        <h1 id="setup-title">Ersteinrichtung</h1>
        <p>Lege den ersten Admin an. Es gibt kein Default-Passwort.</p>

        <form className="auth-form" onSubmit={submit}>
          <label>
            Benutzername
            <input
              value={username}
              minLength={3}
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
              minLength={12}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          <button className="primary-button" disabled={saving}>
            {saving ? "Wird erstellt..." : "Admin erstellen"}
          </button>

          {message && <p className="form-message">{message}</p>}
        </form>
      </section>
    </main>
  );
}
