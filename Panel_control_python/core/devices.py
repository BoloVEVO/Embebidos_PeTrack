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
        # Conversores habituales y USB-JTAG/Serial nativo de Espressif.
        known_vids = {0x10C4, 0x1A86, 0x303A, 0x0403}
        known_names = (
            "cp210", "ch340", "ch341", "ch910", "usb-serial",
            "usb serial", "silicon labs", "espressif", "ftdi",
            "dispositivo serie usb", "usb serial device",
        )
        if p.vid in known_vids or any(k in desc for k in known_names) \
           or any(f"vid:pid={vid:04x}" in hwid for vid in known_vids):
            out.append(ComPort(p.device, p.description or "", p.hwid or ""))
    return sorted(out, key=lambda item: item.device)
