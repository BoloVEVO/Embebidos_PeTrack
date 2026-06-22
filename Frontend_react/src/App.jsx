import { useEffect, useState, useCallback } from "react";
import { getDetections, getHealth, sendReport } from "./api.js";
import DetectionCard from "./components/DetectionCard.jsx";
import StaffView from "./components/StaffView.jsx";

const REFRESH_MS = 4000;

function Hero() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const clock = now.toLocaleTimeString("es-ES", { hour12: false });

  return (
    <header className="hero">
      <div className="hero-inner">
        <span className="hero-chevron" aria-hidden="true">
          <svg width="42" height="24" viewBox="0 0 42 24" fill="none">
            <path d="M1 1 L21 22 L41 1" stroke="currentColor" strokeWidth="2.4" />
          </svg>
        </span>
        <div className="hero-row">
          <p className="hero-side left">
            Vigilancia de<br />mascotas<br />por proximidad
          </p>
          <h1 className="hero-word">petrack</h1>
          <p className="hero-side right">
            Ciudadela<br />residencial<br />privada
          </p>
        </div>
      </div>
      <div className="hero-bottom">
        <span className="hero-tag left">Sistema de vigilancia</span>
        <span className="hero-clock">PETRACK, {clock}</span>
        <span className="hero-tag right">v1.0</span>
      </div>
    </header>
  );
}

function ResidentView() {
  const [residence, setResidence] = useState(
    () => localStorage.getItem("petrack_residence") || "A-12",
  );
  const [detections, setDetections] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [message, setMessage] = useState("");
  const [online, setOnline] = useState(null);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    localStorage.setItem("petrack_residence", residence);
  }, [residence]);

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
        <input
          className="input"
          value={residence}
          onChange={(e) => setResidence(e.target.value)}
          style={{ width: 120 }}
        />
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

export default function App() {
  const [view, setView] = useState("resident");

  return (
    <>
      <nav className="nav">
        <span className="nav-logo">Petrack</span>
        <div className="nav-tabs">
          <button
            className={"nav-tab" + (view === "resident" ? " active" : "")}
            onClick={() => setView("resident")}
          >
            Residente
          </button>
          <button
            className={"nav-tab" + (view === "staff" ? " active" : "")}
            onClick={() => setView("staff")}
          >
            Staff
          </button>
        </div>
      </nav>

      <Hero />

      {view === "resident" ? <ResidentView /> : <StaffView />}
    </>
  );
}
