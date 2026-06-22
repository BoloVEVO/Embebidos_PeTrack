"""
server_ctrl.py — Levanta/detiene el backend Node y comprueba su health.
Empaqueta `npm install` (si falta node_modules) + `node index.js` + GET /.
"""
from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path
from typing import Callable

import requests

from . import paths

LogFn = Callable[[str], None]
_NOOP: LogFn = lambda _m: None


def is_healthy(host: str = "127.0.0.1", port: int = 3000, timeout: float = 1.5) -> bool:
    try:
        r = requests.get(f"http://{host}:{port}/", timeout=timeout)
        return r.status_code == 200
    except requests.RequestException:
        return False


class BackendController:
    """Maneja UN proceso `node index.js` del backend."""

    def __init__(self, port: int = 3000) -> None:
        self.port = port
        self.proc: subprocess.Popen | None = None

    # ------------------------------------------------------------------ #
    def is_alive(self) -> bool:
        return self.proc is not None and self.proc.poll() is None

    def status(self) -> str:
        if is_healthy(port=self.port):
            return "activo"
        if self.is_alive():
            return "iniciando"
        return "detenido"

    # ------------------------------------------------------------------ #
    def _ensure_deps(self, on_log: LogFn) -> bool:
        if (paths.BACKEND_DIR / "node_modules").is_dir():
            return True
        on_log("Instalando dependencias del backend (npm install)...")
        try:
            r = subprocess.run(
                ["npm.cmd", "install"],
                cwd=paths.BACKEND_DIR,
                capture_output=True,
                text=True,
                timeout=300,
                creationflags=_no_window(),
            )
            if r.returncode != 0:
                on_log(f"npm install falló: {r.stderr.strip()[:300]}")
                return False
            on_log("Dependencias del backend OK.")
            return True
        except (OSError, subprocess.TimeoutExpired) as exc:
            on_log(f"ERROR npm install: {exc}")
            return False

    def start(self, on_log: LogFn = _NOOP, health_timeout: float = 25.0) -> bool:
        if is_healthy(port=self.port):
            on_log(f"Backend ya activo en http://localhost:{self.port}")
            return True
        if not self._ensure_deps(on_log):
            return False
        on_log("Lanzando backend (node index.js)...")
        try:
            self.proc = subprocess.Popen(
                ["node.exe", "index.js"],
                cwd=paths.BACKEND_DIR,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=_no_window() | _new_group(),
            )
        except OSError as exc:
            on_log(f"ERROR lanzando node: {exc}")
            return False

        deadline = time.monotonic() + health_timeout
        while time.monotonic() < deadline:
            if not self.is_alive():
                on_log("ERROR: node terminó antes de responder.")
                return False
            if is_healthy(port=self.port):
                on_log(f"Backend ACTIVO en http://localhost:{self.port}")
                return True
            time.sleep(0.5)
        on_log("Timeout esperando health del backend.")
        return False

    def stop(self, on_log: LogFn = _NOOP) -> bool:
        if self.proc is None:
            on_log("No hay backend lanzado por esta GUI.")
            return True
        if self.proc.poll() is not None:
            self.proc = None
            return True
        on_log(f"Deteniendo backend (PID {self.proc.pid})...")
        try:
            self.proc.terminate()
            self.proc.wait(timeout=6)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            self.proc.wait(timeout=4)
        self.proc = None
        on_log("Backend detenido.")
        return True


def _no_window() -> int:
    return getattr(subprocess, "CREATE_NO_WINDOW", 0) if sys.platform == "win32" else 0


def _new_group() -> int:
    return getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) if sys.platform == "win32" else 0
