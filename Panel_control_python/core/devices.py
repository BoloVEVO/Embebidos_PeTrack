"""
devices.py — Detección de los 2 ESP32 conectados por USB.

Heurística:
- Lista los puertos COM con `pyserial`.
- Devuelve hasta 2 candidatos: uno se asigna al collar y otro al dispositivo
  (el usuario decide el orden visualmente, ya que ambos son ESP32).
"""
from __future__ import annotations

from dataclasses import dataclass

try:
    from serial.tools import list_ports
except ImportError:  # noqa: F401
    list_ports = None  # type: ignore


@dataclass
class ComPort:
    device: str        # ej. COM5
    description: str
    hwid: str


def list_esp32_ports() -> list[ComPort]:
    """Devuelve los puertos COM compatibles con drivers típicos de ESP32."""
    if list_ports is None:
        return []
    out: list[ComPort] = []
    for p in list_ports.comports():
        desc = (p.description or "").lower()
        hwid = (p.hwid or "").lower()
        if any(k in desc for k in ("cp210", "ch340", "ch9102", "usb-serial", "silicon labs")) \
           or "vid:pid=10c4" in hwid or "vid:pid=1a86" in hwid:
            out.append(ComPort(p.device, p.description or "", p.hwid or ""))
    return out
