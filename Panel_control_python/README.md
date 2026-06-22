# Panel de Control · PetTrack

GUI plug & play del Proyecto 2 (Sistema de detección de mascotas por proximidad).

## Qué hace
- **Sistema · Levantar TODO** → instala deps (si faltan), arranca backend y frontend, valida que respondan.
- **Backend** (Node) — `node index.js`, health en `http://localhost:3000/`.
- **Frontend** (React+Vite) — `npm run dev`, web en `http://localhost:5173/`.
- **ESP32-CAM** y **Collar** — detecta puertos COM y flashea con PlatformIO (un clic).
- **Red** — IP local + estado de cada dispositivo (heartbeats del backend).

Todo en hilos: la UI nunca se congela.

## Lanzar (Windows)
```
& "C:\Users\ADMIN\Desktop\Proyectos_repos_now\EMBEBIDOS_1\Server_python_fastapi\face_server\.venv\Scripts\python.exe" `
  "C:\Users\ADMIN\Desktop\Proyectos_repos_now\Propuesta2_embedded\Panel_control_python\app.py"
```
O ejecuta `lanzar_panel.bat`.

## Requisitos
- **Node.js** en PATH (`node --version`).
- **PlatformIO** en `C:\Users\ADMIN\.platformio\penv\Scripts\pio.exe` (ya instalado).
- Venv Python con `customtkinter`, `requests`, `pyserial` — se reutiliza el del Proyecto 1.
