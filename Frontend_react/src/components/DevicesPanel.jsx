import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteDevice, getComPorts, getDevices, getFlashJob, getPets, getResidents,
  pairCollar, registerDevice, startFlash,
} from "../api.js";

const RUNNING = ["verifying", "running", "registering"];

function Autocomplete({ label, value, onChange, options = [], placeholder, required = false }) {
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const query = value.trim().toLowerCase();
    return options
      .filter((option) => !query || option.value.toLowerCase().includes(query) || option.label.toLowerCase().includes(query))
      .slice(0, 8);
  }, [options, value]);

  return <label className="autocomplete-field">{label}
    <input
      className="input" value={value} placeholder={placeholder} required={required}
      autoComplete="off" onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
      onChange={(event) => { onChange(event.target.value); setOpen(true); }}
    />
    {open && matches.length > 0 && <div className="autocomplete-menu">
      {matches.map((option) => <button type="button" key={option.value} onMouseDown={() => onChange(option.value)}>
        <strong>{option.value}</strong><span>{option.label}</span>
      </button>)}
    </div>}
  </label>;
}

function deviceLabel(device) {
  if (device.type === "main") return `${device.owner_username || "sin residente"} · ${device.online ? "en línea" : "desconectado"}`;
  return device.main_device_id ? `asociado a ${device.main_device_id}` : "sin dispositivo main";
}

export function DeviceInventory() {
  const [devices, setDevices] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await getDevices();
      const items = Object.values(data.devices || {}).filter((item) => item.type);
      setDevices(items);
      setSelectedId((current) => items.some((item) => item.device_id === current) ? current : (items.find((item) => item.type === "main")?.device_id || items[0]?.device_id || ""));
      setNotice("");
    } catch (error) { setNotice(`No se pudo cargar el inventario: ${error.message}`); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  const mains = devices.filter((item) => item.type === "main");
  const orphanCollars = devices.filter((item) => item.type === "collar" && !item.main_device_id);
  const selected = devices.find((item) => item.device_id === selectedId);
  const associated = selected?.type === "main" ? devices.filter((item) => item.type === "collar" && item.main_device_id === selected.device_id) : [];

  const remove = async (device) => {
    const consequence = device.type === "main" ? " Sus collares quedarán sin dispositivo main." : "";
    if (!window.confirm(`¿Eliminar ${device.device_id} permanentemente de la base de datos?${consequence}`)) return;
    try {
      const result = await deleteDevice(device.device_id);
      setNotice(`${device.device_id} fue eliminado.${result.unlinked_collars ? ` ${result.unlinked_collars} collar(es) quedaron desvinculados.` : ""}`);
      await refresh();
    } catch (error) { setNotice(`No se pudo eliminar: ${error.message}`); }
  };

  return <section>
    <div className="section-header"><div><h1 className="page-title">Dispositivos</h1><p className="page-sub">Inventario de dispositivos main y sus collares asociados.</p></div><button className="btn ghost sm" onClick={refresh}>Actualizar</button></div>
    {notice && <div className="notice-box">{notice}</div>}
    <div className="inventory-layout">
      <aside className="inventory-list">
        <div className="inventory-group-title">Dispositivos main <span>{mains.length}</span></div>
        {mains.map((device) => <button key={device.device_id} className={`inventory-item ${selectedId === device.device_id ? "active" : ""}`} onClick={() => setSelectedId(device.device_id)}>
          <span className={`device-state ${device.online ? "online" : ""}`} /><span><strong>{device.device_id}</strong><small>{deviceLabel(device)}</small></span>
        </button>)}
        {!loading && mains.length === 0 && <p className="inventory-empty">No hay dispositivos main.</p>}
        <div className="inventory-group-title orphan">Collares sin main <span>{orphanCollars.length}</span></div>
        {orphanCollars.map((device) => <button key={device.device_id} className={`inventory-item ${selectedId === device.device_id ? "active" : ""}`} onClick={() => setSelectedId(device.device_id)}>
          <span className="device-state collar" /><span><strong>{device.device_id}</strong><small>{device.pet_id ? `Mascota ${device.pet_id}` : "sin mascota asignada"}</small></span>
        </button>)}
        {!loading && orphanCollars.length === 0 && <p className="inventory-empty">No hay collares huérfanos.</p>}
      </aside>

      <article className="device-detail">
        {!selected && <div className="empty-state"><strong>Selecciona un dispositivo</strong>Su información aparecerá aquí.</div>}
        {selected && <>
          <div className="detail-heading"><div><span className="auth-step">{selected.type === "main" ? "ESP32-CAM · MAIN" : "ESP32-C3 · COLLAR"}</span><h2>{selected.device_id}</h2></div><button className="btn danger sm" onClick={() => remove(selected)}>Eliminar de la base</button></div>
          <div className="detail-properties">
            <div><span>Estado</span><strong>{selected.type === "main" ? (selected.online ? "En línea" : "Desconectado") : (selected.main_device_id ? "Emparejado" : "Sin emparejar")}</strong></div>
            <div><span>Residente</span><strong>{selected.owner_username || "Sin residente"}</strong></div>
            <div><span>Residencia</span><strong>{selected.residence || "Sin asignar"}</strong></div>
            <div><span>Firmware</span><strong>{selected.firmware_version || selected.version || "No informado"}</strong></div>
            {selected.type === "collar" && <div><span>ID mascota</span><strong>{selected.pet_id || "Sin asignar"}</strong></div>}
            {selected.type === "main" && <div><span>Última conexión</span><strong>{selected.last_seen ? new Date(selected.last_seen).toLocaleString() : "Nunca"}</strong></div>}
            {selected.type === "collar" && <>
              <div><span>Última conexión BLE</span><strong>{selected.last_seen ? new Date(selected.last_seen).toLocaleString() : "Nunca detectado"}</strong></div>
              <div><span>Detectado por main</span><strong>{selected.detected_by_main_id || "Ningún dispositivo"}</strong></div>
              <div><span>RSSI de detección</span><strong>{selected.detected_rssi != null ? `${selected.detected_rssi} dBm` : "No informado"}</strong></div>
            </>}
          </div>
          {selected.type === "main" && <div className="associated-list"><div className="inventory-group-title">Collares asociados <span>{associated.length}</span></div>
            {associated.map((collar) => <div className="associated-row" key={collar.device_id}><button onClick={() => setSelectedId(collar.device_id)}><strong>{collar.device_id}</strong><small>Mascota {collar.pet_id || "sin asignar"}</small><small>{collar.last_seen ? `BLE: ${new Date(collar.last_seen).toLocaleString()} · detectado por ${collar.detected_by_main_id || "main desconocido"}` : "Nunca detectado por BLE"}</small></button><span className={`badge ${collar.online ? "resolved" : "dismissed"}`}>{collar.online ? "en línea" : "fuera de alcance"}</span><button className="btn danger sm" onClick={() => remove(collar)}>Eliminar</button></div>)}
            {associated.length === 0 && <p className="meta">Este dispositivo main no tiene collares asociados.</p>}
          </div>}
        </>}
      </article>
    </div>
  </section>;
}

function FlashStatus({ job }) {
  if (!job) return null;
  return <div className={`job-status ${job.status}`}><b>{job.status}</b>{job.logs?.slice(-5).map((line, index) => <code key={index}>{line}</code>)}</div>;
}

export function PairingPanel() {
  const [devices, setDevices] = useState([]);
  const [residents, setResidents] = useState([]);
  const [pets, setPets] = useState([]);
  const [ports, setPorts] = useState([]);
  const [main, setMain] = useState({ device_id: "", owner_username: "", port: "" });
  const [collar, setCollar] = useState({ main_id: "", collar_id: "", pet_id: "", port: "" });
  const [mainJob, setMainJob] = useState(null);
  const [collarJob, setCollarJob] = useState(null);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [deviceData, residentData, portData, petData] = await Promise.all([getDevices(), getResidents(), getComPorts(), getPets()]);
      setDevices(Object.values(deviceData.devices || {}).filter((item) => item.type));
      setResidents(residentData.items || []); setPorts(portData.items || []); setPets(petData.items || []);
    } catch (error) { setNotice(`No se pudieron cargar las opciones: ${error.message}`); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const activeJobs = [mainJob, collarJob].filter((job) => job && RUNNING.includes(job.status));
    if (!activeJobs.length) return;
    const timer = setInterval(async () => {
      for (const current of activeJobs) {
        try {
          const data = await getFlashJob(current.id);
          if (current.id === mainJob?.id) setMainJob(data.job); else setCollarJob(data.job);
          if (data.job.status === "completed") refresh();
        } catch (error) { setNotice(`No se pudo consultar el flasheo: ${error.message}`); }
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [mainJob, collarJob, refresh]);

  const mains = devices.filter((item) => item.type === "main");
  const freeCollars = devices.filter((item) => item.type === "collar" && !item.main_device_id);
  const residentOptions = residents.map((item) => ({ value: item.username, label: item.residence || "sin residencia" }));
  const mainOptions = mains.map((item) => ({ value: item.device_id, label: `${item.owner_username || "sin residente"} · ${item.residence || "sin residencia"}` }));
  const collarOptions = freeCollars.map((item) => ({ value: item.device_id, label: item.pet_id ? `Mascota ${item.pet_id}` : "sin mascota" }));
  const petOptions = pets.map((item) => ({ value: item.pet_id || item.id, label: item.pet || item.name || item.pet_name || item.owner || "mascota registrada" }));
  const portOptions = ports.map((item) => ({ value: item.port, label: item.description || item.port }));

  const registerMain = async (event) => {
    event.preventDefault();
    try { await registerDevice({ device_id: main.device_id, owner_username: main.owner_username, type: "main" }); setNotice(`Main ${main.device_id} registrado.`); await refresh(); }
    catch (error) { setNotice(`Registro rechazado: ${error.message}`); }
  };
  const flashMain = async (mode) => {
    try {
      const data = await startFlash({ target: "main", mode, port: main.port, device_id: mode === "ota" ? main.device_id : null, owner_username: main.owner_username });
      setMainJob(data.job); setNotice("Flasheo del dispositivo main iniciado.");
    } catch (error) { setNotice(`No se pudo iniciar el flasheo main: ${error.message}`); }
  };
  const pair = async (event) => {
    event.preventDefault();
    try { await pairCollar(collar.main_id, collar.collar_id, collar.pet_id); setNotice("Orden BLE enviada al dispositivo main."); await refresh(); }
    catch (error) { setNotice(error.message.includes("collar_already_assigned") ? "Ese collar ya pertenece a otro dispositivo main." : `No se pudo emparejar: ${error.message}`); }
  };
  const flashCollar = async () => {
    try {
      const data = await startFlash({ target: "collar", mode: "com", port: collar.port, main_device_id: collar.main_id, pet_id: collar.pet_id });
      setCollarJob(data.job); setNotice("Flasheo y registro del collar iniciado.");
    } catch (error) { setNotice(`No se pudo iniciar el flasheo del collar: ${error.message}`); }
  };

  return <section>
    <div className="section-header"><div><h1 className="page-title">Emparejamiento</h1><p className="page-sub">Registra y flashea cada tipo de dispositivo en un flujo independiente.</p></div><button className="btn ghost sm" onClick={refresh}>Actualizar opciones</button></div>
    {notice && <div className="notice-box">{notice}</div>}
    <div className="pairing-grid">
      <form className="pairing-card" onSubmit={registerMain}>
        <div className="pairing-card-head"><span className="pairing-icon">M</span><div><span className="auth-step">ESP32-CAM</span><h2>Dispositivo main</h2></div></div>
        <p className="meta">Asígnalo a un residente al registrarlo manualmente o durante el flasheo.</p>
        <Autocomplete label="Residente" required value={main.owner_username} onChange={(value) => setMain({ ...main, owner_username: value })} options={residentOptions} placeholder="Escribe usuario o residencia" />
        <Autocomplete label="ID del dispositivo" required value={main.device_id} onChange={(value) => setMain({ ...main, device_id: value })} options={mainOptions} placeholder="cam-AABBCCDDEEFF" />
        <button className="btn sm" type="submit">Registrar main existente</button>
        <hr className="divider" />
        <Autocomplete label="Puerto de comunicación" value={main.port} onChange={(value) => setMain({ ...main, port: value })} options={portOptions} placeholder="Escribe, por ejemplo COM4" />
        <div className="row"><button className="btn sm" type="button" disabled={!main.port || !main.owner_username || RUNNING.includes(mainJob?.status)} onClick={() => flashMain("com")}>Flashear y registrar</button><button className="btn ghost sm" type="button" disabled={!main.device_id || RUNNING.includes(mainJob?.status)} onClick={() => flashMain("ota")}>Actualizar por OTA</button></div>
        <FlashStatus job={mainJob} />
      </form>

      <form className="pairing-card" onSubmit={pair}>
        <div className="pairing-card-head"><span className="pairing-icon collar">C</span><div><span className="auth-step">ESP32-C3 · BLE</span><h2>Collar</h2></div></div>
        <p className="meta">El collar se asignará a una mascota y a un único dispositivo main.</p>
        <Autocomplete label="Dispositivo main" required value={collar.main_id} onChange={(value) => setCollar({ ...collar, main_id: value })} options={mainOptions} placeholder="Escribe ID, residente o residencia" />
        <Autocomplete label="ID del collar" required value={collar.collar_id} onChange={(value) => setCollar({ ...collar, collar_id: value })} options={collarOptions} placeholder="col-AABBCCDDEEFF" />
        <Autocomplete label="ID de la mascota" required value={collar.pet_id} onChange={(value) => setCollar({ ...collar, pet_id: value })} options={petOptions} placeholder="Escribe ID o nombre de mascota" />
        <button className="btn sm" type="submit">Registrar y emparejar por BLE</button>
        <hr className="divider" />
        <Autocomplete label="Puerto de comunicación" value={collar.port} onChange={(value) => setCollar({ ...collar, port: value })} options={portOptions} placeholder="Escribe, por ejemplo COM5" />
        <button className="btn sm" type="button" disabled={!collar.port || !collar.main_id || !collar.pet_id || RUNNING.includes(collarJob?.status)} onClick={flashCollar}>Flashear, registrar y emparejar</button>
        <FlashStatus job={collarJob} />
      </form>
    </div>
  </section>;
}

export default DeviceInventory;
