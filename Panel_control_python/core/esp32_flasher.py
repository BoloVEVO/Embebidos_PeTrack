"""
esp32_flasher.py — Flashea collar / dispositivo con PlatformIO.

Funciones:
  patch_config(project_dir, *, backend_host, wifi_ssid, wifi_pass)
    Parcheа DEFAULT_* en src/config.h ANTES de compilar para inyectar
    la IP del backend y las credenciales WiFi desde el panel.

  flash(project_dir, port, on_log)
    Lanza `pio run -d <dir> -t upload --upload-port <COM>` y vuelca el
    log al callback en streaming, sin congelar la UI.
"""
from __future__ import annotations

import re
import subprocess
from pathlib import Path
from typing import Callable

from . import paths

LogFn = Callable[[str], None]
_NOOP: LogFn = lambda _m: None


def _no_window() -> int:
    return getattr(subprocess, "CREATE_NO_WINDOW", 0)


def patch_config(
    project_dir,
    *,
    backend_host: str | None = None,
    wifi_ssid: str | None = None,
    wifi_pass: str | None = None,
) -> list[str]:
    """Parcheа DEFAULT_* en src/config.h y devuelve lista de cambios aplicados.

    Solo modifica las líneas que corresponden a los parámetros no-None.
    Es seguro ejecutarlo varias veces: usa regex que no acumula escapes.
    """
    cfg_path = Path(project_dir) / "src" / "config.h"
    if not cfg_path.exists():
        return [f"AVISO: no se encontró {cfg_path}"]

    text = cfg_path.read_text(encoding="utf-8")
    changes: list[str] = []

    patches: list[tuple[str, str, str]] = []
    if backend_host is not None:
        patches.append((
            r'(#define\s+DEFAULT_BACKEND_HOST\s+)"[^"]*"',
            rf'\1"{backend_host}"',
            f"DEFAULT_BACKEND_HOST -> {backend_host}",
        ))
    if wifi_ssid is not None:
        patches.append((
            r'(#define\s+DEFAULT_WIFI_SSID\s+)"[^"]*"',
            rf'\1"{wifi_ssid}"',
            f"DEFAULT_WIFI_SSID -> {wifi_ssid}",
        ))
    if wifi_pass is not None:
        patches.append((
            r'(#define\s+DEFAULT_WIFI_PASS\s+)"[^"]*"',
            rf'\1"{wifi_pass}"',
            "DEFAULT_WIFI_PASS -> ***",
        ))

    new_text = text
    for pattern, replacement, label in patches:
        result = re.sub(pattern, replacement, new_text)
        if result != new_text:
            changes.append(label)
        new_text = result

    if new_text != text:
        cfg_path.write_text(new_text, encoding="utf-8")

    return changes


def flash(project_dir, port: str, on_log: LogFn = _NOOP) -> bool:
    """Compila + flashea el firmware del directorio dado al puerto COM dado."""
    cmd = [str(paths.PIO_EXE), "run", "-d", str(project_dir),
           "-t", "upload", "--upload-port", port]
    on_log("Lanzando: " + " ".join(cmd))
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            creationflags=_no_window(),
        )
    except OSError as exc:
        on_log(f"ERROR lanzando pio: {exc}")
        return False

    assert proc.stdout is not None
    for line in proc.stdout:
        line = line.rstrip()
        if line:
            on_log(line)
    rc = proc.wait()
    if rc == 0:
        on_log("Flasheo OK.")
        return True
    on_log(f"Flasheo FALLÓ (rc={rc}).")
    return False
