"""paths.py — Rutas absolutas a los módulos del proyecto y herramientas."""
from pathlib import Path

PANEL_DIR = Path(__file__).resolve().parent.parent
ROOT = PANEL_DIR.parent

BACKEND_DIR = ROOT / "Backend_node"
FRONTEND_DIR = ROOT / "Frontend_react"
COLLAR_DIR = ROOT / "Collar_esp32c3"
DEVICE_DIR = ROOT / "Device_esp32cam"

VENV_PY = Path(
    r".venv/Scripts/python.exe"
)

PIO_EXE = Path(r"C:\Users\ADMIN\.platformio\penv\Scripts\pio.exe")
