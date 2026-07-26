import { useCallback, useEffect, useState } from "react";
import { getReports, resolveReport } from "../api.js";
import { DeviceInventory, PairingPanel } from "./DevicesPanel.jsx";

const SECTIONS = [
  { key: "devices", label: "Dispositivos", hint: "Inventario y asignaciones" },
  { key: "pairing", label: "Emparejamiento", hint: "Registro y firmware" },
  { key: "reports", label: "Reportes", hint: "Incidentes de residentes" },
];
const FILTERS = [{ key: "pending", label: "Pendientes" }, { key: "resolved", label: "Resueltos" }, { key: "all", label: "Todos" }];
const STATUS_LABEL = { pending: "pendiente", resolved: "resuelto", dismissed: "descartado" };

function ReportCard({ report, onResolve }) {
  const when = report.ts ? new Date(report.ts).toLocaleString() : "—";
  const count = report.detection_ids?.length ?? 0;
  const status = report.status || "pending";
  const [loading, setLoading] = useState(false);
  const handleResolve = async () => { setLoading(true); try { await onResolve(report.id); } finally { setLoading(false); } };
  return <div className={`report-card${status === "resolved" ? " resolved" : ""}`}>
    <div className="row" style={{ justifyContent: "space-between" }}><span className="report-residence">Residencia {report.residence}</span><span className={`badge ${status}`}>{STATUS_LABEL[status] ?? status}</span></div>
    {report.message && <p className="report-message" style={{ margin: 0 }}>{report.message}</p>}
    <hr className="divider" />
    <div className="report-footer"><span className="meta">{count} {count === 1 ? "detección" : "detecciones"} · {when}</span>{status === "pending" && <button className="btn resolve" onClick={handleResolve} disabled={loading}>{loading ? "Guardando…" : "Marcar resuelto"}</button>}</div>
  </div>;
}

function ReportsPanel() {
  const [filter, setFilter] = useState("pending");
  const [reports, setReports] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, resolved: 0, all: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const refresh = useCallback(async () => {
    try {
      const [allData, filteredData] = await Promise.all([getReports(undefined, 200), filter === "all" ? getReports(undefined, 200) : getReports(filter, 200)]);
      const all = allData.items || [];
      setCounts({ pending: all.filter((item) => item.status === "pending").length, resolved: all.filter((item) => item.status === "resolved").length, all: all.length });
      setReports(filter === "all" ? all : (filteredData.items || [])); setError(null);
    } catch (fetchError) { setError(fetchError.message); }
  }, [filter]);
  useEffect(() => { setLoading(true); refresh().finally(() => setLoading(false)); const timer = setInterval(refresh, 5000); return () => clearInterval(timer); }, [refresh]);
  const handleResolve = async (id) => { await resolveReport(id); await refresh(); };

  return <section>
    <h1 className="page-title">Reportes</h1><p className="page-sub">Reportes de residentes sobre mascotas sin supervisión.</p>
    <div className="section-header"><div className="filter-tabs">{FILTERS.map(({ key, label }) => <button key={key} className={`filter-tab${filter === key ? " active" : ""}`} onClick={() => setFilter(key)}>{label}{counts[key] > 0 && <span className="count-badge">{counts[key]}</span>}</button>)}</div><button className="btn ghost sm" onClick={refresh}>Actualizar</button></div>
    {error && <div className="error-msg">No se pudieron cargar los reportes: {error}</div>}
    {!error && !loading && reports.length === 0 && <div className="empty-state"><strong>Sin reportes</strong>{filter === "pending" ? "No hay reportes pendientes de revisión." : "No hay reportes en esta categoría."}</div>}
    <div className="report-grid">{reports.map((report) => <ReportCard key={report.id} report={report} onResolve={handleResolve} />)}</div>
  </section>;
}

export default function StaffView() {
  const [section, setSection] = useState("devices");
  return <div className="staff-shell">
    <aside className="staff-sidebar">
      <div className="staff-sidebar-title"><small>Administración</small><strong>Panel Staff</strong></div>
      <nav aria-label="Secciones del panel">{SECTIONS.map((item) => <button key={item.key} className={section === item.key ? "active" : ""} onClick={() => setSection(item.key)}><span>{item.label}</span><small>{item.hint}</small></button>)}</nav>
      <div className="staff-brand"><span className="nav-logo">Petrack</span><small>Configuración</small></div>
    </aside>
    <main className="staff-content">{section === "devices" && <DeviceInventory />}{section === "pairing" && <PairingPanel />}{section === "reports" && <ReportsPanel />}</main>
  </div>;
}
