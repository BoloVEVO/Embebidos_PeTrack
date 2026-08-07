import { photoUrl } from "../api.js";

export default function DetectionCard({ det, selected, onToggle }) {
  const when = det.ts ? new Date(det.ts).toLocaleString() : "—";
  return (
    <div
      className={"card" + (selected ? " selected" : "")}
      onClick={() => onToggle(det.id)}
    >
      <img src={photoUrl(det.photo_id)} alt="Mascota detectada" loading="lazy" />
      <div className="body">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
          <span className="pet-name">{det.pet || "Mascota cercana registrada"}</span>
          <span className={"badge" + (det.registered ? "" : " warn")}>
            {det.registered ? "registrada" : "sin registro"}
          </span>
        </div>
        <div className="meta">Dueño: {det.owner || "—"}</div>
        <div className="meta">Residencia mascota: {det.pet_residence || "—"}</div>
        <div className="meta">
          ID: {det.pet_id} · RSSI: {det.rssi ?? "—"} dBm
        </div>
        <div className="meta">
          Ángulo: {det.inclination_angle != null ? `${Number(det.inclination_angle).toFixed(1)}°` : "No disponible"}
        </div>
        <div className="meta">{when}</div>
        <label className="checkbox-row" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={selected} onChange={() => onToggle(det.id)} />
          Incluir en el reporte
        </label>
      </div>
    </div>
  );
}
