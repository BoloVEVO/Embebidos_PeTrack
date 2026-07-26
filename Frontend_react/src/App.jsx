import { useEffect, useState, useCallback } from "react";
import { getSession, login, register, logout } from "./api.js";
import ResidentView from "./components/ResidentView.jsx";
import StaffView from "./components/StaffView.jsx";

/*
function LegacyResidentView({ user }) {
  const residence = user.residence;
  const [detections, setDetections] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [message, setMessage] = useState("");
  const [online, setOnline] = useState(null);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      await getHealth();
      setOnline(true);
      const data = await getDetections(residence, 30);
      setDetections(data.items || []);
      setError(null);
    } catch (e) {
      setOnline(false);
      setError(e.message);
    }
  }, [residence]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const onSend = async () => {
    if (selected.size === 0) {
      setNotice("Selecciona al menos una detección para reportar.");
      return;
    }
    setSending(true);
    setNotice("");
    try {
      await sendReport(residence, [...selected], message.trim());
      setSelected(new Set());
      setMessage("");
      setNotice("Reporte enviado al Staff.");
    } catch (e) {
      setNotice("No se pudo enviar: " + e.message);
    } finally {
      setSending(false);
    }
  };

  const dotClass = online === null ? "" : online ? " ok" : " danger";

  return (
    <div className="wrap">
      <div className="section-header">
        <div>
          <h2 className="page-title">Detecciones</h2>
          <p className="page-sub" style={{ margin: 0 }}>
            Mascotas detectadas cerca de tu residencia.
          </p>
        </div>
        <div className="row">
          <span className="status-pill">
            <span className={"status-dot" + dotClass} />
            {online === null ? "conectando" : online ? "en línea" : "sin conexión"}
          </span>
          <button className="btn ghost sm" onClick={refresh}>Actualizar</button>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 26 }}>
        <label style={{
          fontSize: 11, color: "var(--muted)", letterSpacing: "0.12em",
          textTransform: "uppercase"
        }}>
          Mi residencia
        </label>
        <span className="residence-value">{residence}</span>
      </div>

      {error && <div className="error-msg">No se pudo cargar: {error}</div>}

      {!error && detections.length === 0 && (
        <div className="empty-state">
          <strong>Sin detecciones</strong>
          Aún no hay mascotas detectadas cerca de la residencia {residence}.
        </div>
      )}

      <div className="grid">
        {detections.map((d) => (
          <DetectionCard
            key={d.id}
            det={d}
            selected={selected.has(d.id)}
            onToggle={toggle}
          />
        ))}
      </div>

      <div className="reportbar">
        <p className="reportbar-title">Reportar al Staff</p>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>
          {selected.size} {selected.size === 1 ? "detección seleccionada" : "detecciones seleccionadas"}.
          Describe el incidente.
        </span>
        <textarea
          className="textarea"
          rows={2}
          placeholder="Ej: Desecho en el jardín delantero esta mañana."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <div className="row">
          <button className="btn" onClick={onSend} disabled={sending}>
            {sending ? "Enviando…" : "Enviar reporte al Staff"}
          </button>
          {notice && (
            <span className={"notice" + (notice.startsWith("No") ? " err" : "")}>
              {notice}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
*/

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ username: "", password: "", role: "resident", residence: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const change = (key) => (e) => setForm((old) => ({ ...old, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const data = mode === "login"
        ? await login(form.username, form.password)
        : await register(form.username, form.password, form.role, form.residence);
      onAuthenticated(data.user);
    } catch (err) {
      const duplicate = err.message.includes("username_taken");
      setError(duplicate ? "Ese nombre de usuario ya está registrado." :
        mode === "login" ? "Usuario o contraseña incorrectos." : "No se pudo crear la cuenta. Revisa los datos.");
    } finally { setBusy(false); }
  };

  return (
    <main className="auth-page">
      <section className="auth-brand">
        <span className="auth-kicker">Sistema de vigilancia</span>
        <h1>petrack</h1>
        <p>Protección residencial de mascotas mediante detección por proximidad.</p>
      </section>
      <section className="auth-panel">
        <div className="auth-tabs">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(""); }}>Iniciar sesión</button>
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setError(""); }}>Crear cuenta</button>
        </div>
        <form className="auth-form" onSubmit={submit}>
          <div><span className="auth-step">01</span><h2>{mode === "login" ? "Bienvenido" : "Nueva cuenta"}</h2></div>
          <label>Usuario<input className="input" autoComplete="username" minLength="3" maxLength="32" required value={form.username} onChange={change("username")} /></label>
          <label>Contraseña<input className="input" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength="8" required value={form.password} onChange={change("password")} /></label>
          {mode === "register" && <>
            <label>Tipo de cuenta<select className="input" value={form.role} onChange={change("role")}><option value="resident">Residente</option><option value="staff">Staff</option></select></label>
            {form.role === "resident" && <label>Residencia<input className="input" placeholder="Ej. A-12" required value={form.residence} onChange={change("residence")} /></label>}
          </>}
          {error && <div className="error-msg">{error}</div>}
          <button className="btn auth-submit" disabled={busy}>{busy ? "Procesando…" : mode === "login" ? "Entrar" : "Crear cuenta"}</button>
        </form>
      </section>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => { getSession().then((d) => setUser(d.user)).catch(() => {}).finally(() => setChecking(false)); }, []);
  const signOut = async () => { try { await logout(); } finally { setUser(null); } };

  if (checking) return <div className="session-loading">PETRACK</div>;
  if (!user) return <AuthScreen onAuthenticated={setUser} />;

  return (
    <>
      <nav className="nav">
        <span className="nav-logo">Petrack</span>
        <div className="nav-account">
          <span><strong>{user.username}</strong><small>{user.role === "resident" ? `Residente · ${user.residence}` : "Staff"}</small></span>
          <button className="nav-tab" onClick={signOut}>Salir</button>
        </div>
      </nav>

      {user.role === "resident" ? <ResidentView user={user} /> : <StaffView />}
    </>
  );
}
