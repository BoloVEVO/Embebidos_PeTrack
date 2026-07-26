"""paths.py — Rutas absolutas a los módulos del proyecto y herramientas."""
from pathlib import Path
from shutil import which

PANEL_DIR = Path(__file__).resolve().parent.parent
ROOT = PANEL_DIR.parent

BACKEND_DIR = ROOT / "Backend_node"
FRONTEND_DIR = ROOT / "Frontend_react"
COLLAR_DIR = ROOT / "Collar_esp32c3"
DEVICE_DIR = ROOT / "Device_esp32cam"

VENV_PY = PANEL_DIR / ".venv" / "Scripts" / "python.exe"


def find_pio() -> Path:
    """Localiza PlatformIO sin depender del nombre del usuario de Windows."""
    executable = which("pio") or which("platformio")
    if executable:
        return Path(executable).resolve()

    default = Path.home() / ".platformio" / "penv" / "Scripts" / "pio.exe"
    if default.is_file():
        return default

    raise FileNotFoundError(
        "No se encontró PlatformIO. Instálalo o agrega 'pio' al PATH."
    )


PIO_EXE = find_pio()
