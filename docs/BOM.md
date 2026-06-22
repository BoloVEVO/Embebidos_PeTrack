# BOM — Lista de materiales (del documento de propuesta)

## Dispositivo Controlador (residencia) — IP44 — Presupuesto $36
| Componente | Costo | Voltaje | Corriente | Potencia |
|---|---|---|---|---|
| ESP32-CAM | $15 | 5V / 3.7V | 500mA / 50mA | 250mW |
| USB-TTL FTDI | $6 | 5V | 1A | 275mW |
| Batería de Litio Mini | $15 | — | — | N/A (5W max) |

## Dispositivo Sensor (collar) — IP68 — Presupuesto $25
| Componente | Costo | Voltaje | Corriente | Potencia |
|---|---|---|---|---|
| ESP32-C3 SUPERMINI | $10 | 3.7V | 40mA | 185–407mW |
| Batería de Litio Mini | $12 | 3.7V | 110mA | — |
| Módulo de carga TP4056 | $3 | 3.7V | 40mA | — |

## Componentes individuales (estimado)
| Componente | Costo |
|---|---|
| Jumpers | $3 |
| Resistencias | $5 |
| Diodos | $5 |

## Software
- Base de datos NoSQL: **Firebase (Firestore)**.
- Backend/Frontend: **Node.js + React**.

## Notas
- El collar incluye batería; el dispositivo principal incluye módulo de carga TP4056 (USB) **solo para fines demostrativos**; en uso real va conectado a la red eléctrica (no portable).
- Comunicación: collar→dispositivo por **BLE**; dispositivo→servidor por **WiFi**.
