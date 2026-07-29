# Arquitectura — Sistema de detección de mascotas por proximidad

## Componentes
1. **Collar (ESP32-C3 Mini/SuperMini)** — beacon BLE; reanuncia cada 5 s.
2. **Dispositivo residencia (ESP32-CAM)** — escanea BLE, detecta por RSSI, toma foto al detectar, sube por WiFi.
3. **Backend (Node/Express + Firebase Firestore)** — recibe, almacena (foto en disco, metadata en Firestore), sirve a la web.
4. **Frontend (React + Vite)** — el residente ve detecciones y reporta al Staff.

## Identificadores BLE (FIJOS del proyecto) — DECISIÓN P2
- **Service UUID:** `9d3a2f00-1c2b-4e6a-9f00-a1b2c3d4e5f6`
- **Nombre BLE:** `PETPROX` · **Company ID:** `0xFFFF` (reservado para pruebas).
- **Reparto del advertising (límite legacy de 31 bytes):**
  - *Advertisement:* flags + nombre `PETPROX` + manufacturer data (`COMPANY_ID` 2B + **`pet_id`**).
  - *Scan response:* Service UUID 128-bit (descubrimiento).
- **El collar SOLO emite `pet_id`** (compacto). Los datos de mascota/dueño/residencia de origen **NO viajan por BLE**: se resuelven en el backend desde el registro `pets` (`pet_id → {pet, owner, residence}`). Esto evita el desbordamiento de los 31 bytes y centraliza la gestión (el Staff edita el registro). *Base fuerte contra errores futuros.*
- El dispositivo filtra por **Company ID + nombre** (y opcionalmente el Service UUID de la scan-response).

## Proximidad
- "Cerca" = `RSSI ≥ RSSI_THRESHOLD` (configurable, p. ej. −70 dBm).
- Suavizado (media móvil de N lecturas) + histéresis para evitar parpadeo.
- **Cooldown** por `pet_id` (p. ej. 30 s) para no spamear capturas/uploads.

## Contrato de datos (implementado en P5)
- `POST /detection` (multipart): `meta` (JSON `{pet_id, residence, rssi, ts}` — `residence` = dónde se detectó, la del dispositivo/residente) + `photo` (JPEG). El backend **enriquece** con el registro `pets`.
- `detections`: `{ pet_id, pet, owner, pet_residence, registered, residence, rssi, ts, photo_id }`.
  - `pet/owner/pet_residence` ← registro `pets` (null + `registered:false` si la mascota no está registrada).
  - `residence` = residencia donde se detectó (filtro de la web del residente).
- `pets`: `{ pet_id, pet, owner, residence }` (residence = hogar de la mascota). Endpoints `POST /pets`, `GET /pets`, `GET /pets/:id`.
- `reports`: `{ residence, detection_ids[], message, status, ts }`. `POST /report`, `GET /reports`.
- `devices`: heartbeat `POST /device/heartbeat {device_id,...}` + `GET /device/status` (online si < 45 s).
- Fotos en disco: `Backend_node/storage/photos/<photo_id>.jpg`, servidas por `GET /photos/:id`.

## Coexistencia WiFi + BLE (ESP32-CAM)
- Usar **NimBLE** (bajo consumo de RAM).
- Time-slicing: escanear BLE en ventanas; al detectar y pasar el cooldown, **pausar el scan**, capturar, conectar WiFi y subir, luego reanudar.
- Framesize moderado para no agotar PSRAM con BLE activo.

## Privacidad
- La cámara captura **solo al detectar** una mascota (requisito de la propuesta) → minimiza grabación de alrededores.
- Retención corta de fotos en disco (configurable).
