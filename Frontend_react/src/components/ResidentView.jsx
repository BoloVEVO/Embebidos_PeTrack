import { useCallback, useEffect, useState } from "react";
import { getDetections, getHealth, getMyDevices, getVideoSessions, liveVideoUrl, recordedVideoUrl, photoUrl, sendReport } from "../api.js";

const REFRESH_MS = 4000;
const SECTIONS = [
  { key: "recent", label: "Detecciones recientes", hint: "Actividad de tus dispositivos" },
  { key: "devices", label: "Mis dispositivos", hint: "Estado de mains y collares" },
  { key: "report", label: "Reportar al Staff", hint: "Seleccionar detecciones" },
];

function DetectionSummary({ detection, videoSession, active, onClick, selectable, checked, onToggle }) {
  const when = detection.ts ? new Date(detection.ts).toLocaleString() : "Hora desconocida";
  const pets = detection.pets?.length ? detection.pets : [{ pet: detection.pet, pet_id: detection.pet_id }];
  const petLabel = pets.map((item) => item.pet || item.pet_id).filter(Boolean).join(", ") || "Mascota cercana registrada";
  return <button type="button" className={`resident-detection-row${active ? " active" : ""}`} onClick={onClick}>
    {selectable && <input type="checkbox" checked={checked} onClick={(event) => event.stopPropagation()} onChange={onToggle} aria-label={`Seleccionar detección ${detection.id}`} />}
    <span className="detection-thumb"><img src={photoUrl(detection.photo_id)} alt="" /></span>
    <span className="detection-row-copy"><strong>{petLabel}</strong><small>{pets.length} {pets.length === 1 ? "mascota cercana" : "mascotas cercanas"} · {when}</small><code>{detection.id}</code></span>
    <span className={`badge ${videoSession?.status === "live" ? "resolved" : ""}`}>{videoSession?.status === "live" ? "● En vivo" : detection.device_id}</span>
  </button>;
}

function DetectionVideo({ session }) {
  if (!session) return null;
  const label = session.status === "live" ? "● Detección ocurriendo ahora"
    : session.status === "processing" ? "Codificando video"
      : session.status === "completed" ? "Video finalizado" : "Error de video";
  return <section className="detection-video">
    <div className="detection-video-head"><span className={`badge ${session.status === "live" ? "resolved" : ""}`}>{label}</span><small>{session.frame_count} imágenes · {session.fps || 10} FPS</small></div>
    {session.status === "live" && <img src={liveVideoUrl(session.id)} alt="Detección en vivo" />}
    {session.status === "completed" && session.video_ready && <video controls preload="metadata" src={recordedVideoUrl(session.id)} />}
    {session.status !== "live" && !session.video_ready && <div className="video-processing">{session.status === "failed" ? session.error : "Preparando el video final…"}</div>}
  </section>;
}

export default function ResidentView({ user }) {
  const [section, setSection] = useState("recent");
  const [detections, setDetections] = useState([]);
  const [devices, setDevices] = useState({ mains: [], collars: [] });
  const [videoSessions, setVideoSessions] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [reportIds, setReportIds] = useState(() => new Set());
  const [message, setMessage] = useState("");
  const [online, setOnline] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      await getHealth();
      const [data, deviceData, videoData] = await Promise.all([getDetections(user.residence, 50), getMyDevices(), getVideoSessions()]);
      const items = data.items || [];
      setDetections(items);
      setDevices({ mains: deviceData.mains || [], collars: deviceData.collars || [] });
      setVideoSessions(videoData.items || []);
      setSelectedId((current) => items.some((item) => item.id === current) ? current : (items[0]?.id || ""));
      setReportIds((current) => new Set([...current].filter((id) => items.some((item) => item.id === id))));
      setOnline(true); setError("");
    } catch (fetchError) { setOnline(false); setError(fetchError.message); }
  }, [user.residence]);

  useEffect(() => { refresh(); const timer = setInterval(refresh, REFRESH_MS); return () => clearInterval(timer); }, [refresh]);
  const selected = detections.find((item) => item.id === selectedId);
  const videoFor = (detection) => videoSessions.find((session) => session.detection_id === detection.id) ||
    videoSessions.find((session) => session.device_id === detection.device_id && Math.abs(Date.parse(session.started_at) - Date.parse(detection.ts)) <= 30000);
  const selectedVideo = selected ? videoFor(selected) : null;
  const toggle = (id) => setReportIds((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const submit = async () => {
    if (!reportIds.size) { setNotice("Selecciona al menos una detección."); return; }
    setSending(true); setNotice("");
    try { await sendReport(user.residence, [...reportIds], message.trim()); setReportIds(new Set()); setMessage(""); setNotice("Reporte enviado al Staff y dispositivos verificados."); }
    catch (submitError) { setNotice(`No se pudo enviar: ${submitError.message}`); }
    finally { setSending(false); }
  };

  return <div className="staff-shell resident-shell">
    <aside className="staff-sidebar">
      <div className="staff-sidebar-title"><small>Residencia {user.residence}</small><strong>Panel residente</strong></div>
      <nav aria-label="Secciones del residente">{SECTIONS.map((item) => <button key={item.key} className={section === item.key ? "active" : ""} onClick={() => setSection(item.key)}><span>{item.label}</span><small>{item.hint}</small></button>)}</nav>
      <div className="staff-brand"><span className="nav-logo">Petrack</span><small>Mi residencia</small></div>
    </aside>
    <main className="staff-content">
      {section === "recent" && <section>
        <div className="section-header"><div><h1 className="page-title">Detecciones recientes</h1><p className="page-sub">Actividad capturada por los dispositivos main asociados a tu cuenta.</p></div><div className="row"><span className="status-pill"><span className={`status-dot${online ? " ok" : online === false ? " danger" : ""}`} />{online ? "en línea" : online === false ? "sin conexión" : "conectando"}</span><button className="btn ghost sm" onClick={refresh}>Actualizar</button></div></div>
        {error && <div className="error-msg">No se pudo cargar: {error}</div>}
        <div className="resident-detection-layout">
          <div className="resident-detection-list">{detections.map((item) => <DetectionSummary key={item.id} detection={item} videoSession={videoFor(item)} active={selectedId === item.id} onClick={() => setSelectedId(item.id)} />)}{!error && !detections.length && <div className="empty-state"><strong>Sin detecciones</strong>No hay actividad reciente para tus dispositivos.</div>}</div>
          <article className="resident-detection-detail">{selected ? <><DetectionVideo session={selectedVideo} /><img src={photoUrl(selected.photo_id)} alt="Captura de la detección" /><div className="detail-heading"><div><span className="auth-step">CAPTURA VERIFICADA</span><h2>{selected.pets?.length || 1} {(selected.pets?.length || 1) === 1 ? "mascota cercana registrada" : "mascotas cercanas registradas"}</h2></div></div><div className="detail-properties"><div><span>Hora de captura</span><strong>{selected.ts ? new Date(selected.ts).toLocaleString() : "No disponible"}</strong></div><div><span>ID detección</span><strong>{selected.id}</strong></div><div><span>Dispositivo main</span><strong>{selected.device_id}</strong></div><div><span>Mascotas detectadas</span><strong>{(selected.pets?.length ? selected.pets : [{ pet: selected.pet, pet_id: selected.pet_id }]).map((item) => `${item.pet || "Mascota cercana registrada"} (${item.pet_id})`).join(", ")}</strong></div><div><span>Ángulo de inclinación</span><strong>{selected.inclination_angle != null ? `${Number(selected.inclination_angle).toFixed(1)}°` : "No disponible"}</strong></div></div></> : <div className="empty-state"><strong>Selecciona una detección</strong>La imagen, el video y la hora aparecerán aquí.</div>}</article>
        </div>
      </section>}

      {section === "devices" && <section>
        <div className="section-header"><div><h1 className="page-title">Mis dispositivos</h1><p className="page-sub">Estado de los dispositivos main y collares asociados a tu residencia.</p></div><button className="btn ghost sm" onClick={refresh}>Actualizar</button></div>
        {error && <div className="error-msg">No se pudieron cargar los dispositivos: {error}</div>}
        <div className="resident-device-groups">
          <div><div className="resident-device-group-title"><span>Dispositivos main</span><b>{devices.mains.length}</b></div><div className="resident-device-grid">
            {devices.mains.map((device) => { const collars = devices.collars.filter((collar) => collar.main_device_id === device.device_id); return <article className="resident-device-card" key={device.device_id}><div className="resident-device-card-head"><span className={`device-state ${device.online ? "online" : ""}`} /><div><span className="auth-step">ESP32-CAM · MAIN</span><h2>{device.device_id}</h2></div><span className={`badge ${device.online ? "resolved" : "dismissed"}`}>{device.online ? "en línea" : "desconectado"}</span></div><div className="detail-properties"><div><span>Residencia</span><strong>{device.residence || user.residence}</strong></div><div><span>Firmware</span><strong>{device.firmware_version || device.fw || "No informado"}</strong></div><div><span>Última conexión</span><strong>{device.last_seen ? new Date(device.last_seen).toLocaleString() : "Nunca"}</strong></div><div><span>Collares asociados</span><strong>{collars.length}</strong></div></div>{collars.length > 0 && <div className="resident-collars-mini">{collars.map((collar) => <div key={collar.device_id}><span className={`device-state ${collar.online ? "online" : "collar"}`} /><span><strong>{collar.device_id}</strong><small>Mascota {collar.pet_id || "sin asignar"}</small></span><span className={`badge ${collar.online ? "resolved" : "dismissed"}`}>{collar.online ? "en línea" : "sin conexión"}</span></div>)}</div>}</article>; })}
            {!error && devices.mains.length === 0 && <div className="empty-state"><strong>Sin dispositivos main</strong>El Staff todavía no ha asignado un dispositivo main a tu cuenta.</div>}
          </div></div>
          <div><div className="resident-device-group-title"><span>Collares asociados</span><b>{devices.collars.length}</b></div><div className="resident-collar-grid">{devices.collars.map((collar) => <article className="resident-collar-card" key={collar.device_id}><div><span className={`device-state ${collar.online ? "online" : "collar"}`} /><span><span className="auth-step">ESP32-C3 · COLLAR</span><h3>{collar.device_id}</h3></span></div><dl><div><dt>Mascota</dt><dd>{collar.pet_id || "Sin asignar"}</dd></div><div><dt>Ángulo de inclinación</dt><dd>{collar.inclination_angle != null ? `${Number(collar.inclination_angle).toFixed(1)}°` : "No disponible"}</dd></div><div><dt>Main asignado</dt><dd>{collar.main_device_id}</dd></div><div><dt>Detectado por</dt><dd>{collar.detected_by_main_id || "Ningún main"}</dd></div><div><dt>Última detección</dt><dd>{collar.last_seen ? new Date(collar.last_seen).toLocaleString() : "Nunca"}</dd></div><div><dt>Estado</dt><dd>{collar.online ? "Detectado recientemente" : "Fuera de alcance"}</dd></div></dl></article>)}</div></div>
        </div>
      </section>}

      {section === "report" && <section>
        <div className="section-header"><div><h1 className="page-title">Reportar al Staff</h1><p className="page-sub">Selecciona las detecciones que respaldan el incidente.</p></div><span className="count-badge">{reportIds.size}</span></div>
        {error && <div className="error-msg">No se pudieron cargar las detecciones: {error}</div>}
        <div className="resident-report-layout"><div className="resident-detection-list report-select-list">{detections.map((item) => <DetectionSummary key={item.id} detection={item} videoSession={videoFor(item)} selectable checked={reportIds.has(item.id)} onToggle={() => toggle(item.id)} onClick={() => toggle(item.id)} />)}{!detections.length && <div className="empty-state"><strong>Sin detecciones disponibles</strong>Necesitas una detección válida para crear un reporte.</div>}</div>
          <aside className="report-compose"><span className="auth-step">NUEVO REPORTE</span><h2>Detalles del incidente</h2><p className="meta">El servidor comprobará que cada detección pertenece a uno de tus dispositivos main antes de guardar el reporte.</p><textarea className="textarea" rows={6} placeholder="Describe lo ocurrido…" value={message} onChange={(event) => setMessage(event.target.value)} /><button className="btn" disabled={sending || !reportIds.size} onClick={submit}>{sending ? "Verificando…" : "Enviar reporte al Staff"}</button>{notice && <div className="notice-box">{notice}</div>}</aside>
        </div>
      </section>}
    </main>
  </div>;
}
