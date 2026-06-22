"""
frontend_ctrl.py — Levanta/detiene el frontend React (Vite dev server).
"""
from __future__ import annotations

import socket
import subprocess
import sys
import time
from typing import Callable

from . import paths
from .server_ctrl import _no_window, _new_group  # type: ignore

LogFn = Callable[[str], None]
_NOOP: LogFn = lambda _m: None
PORT = 5173


def is_up(host: str = "127.0.0.1", port: int = PORT, timeout: float = 1.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


class FrontendController:
    """Maneja UN proceso `npm run dev` del frontend (Vite)."""

    def __init__(self, port: int = PORT) -> None:
        self.port = port
        self.proc: subprocess.Popen | None = None

    def is_alive(self) -> bool:
        return self.proc is not None and self.proc.poll() is None

    def status(self) -> str:
        if is_up(port=self.port):
            return "activo"
        if self.is_alive():
            return "iniciando"
        return "detenido"

    def _ensure_deps(self, on_log: LogFn) -> bool:
        if (paths.FRONTEND_DIR / "node_modules").is_dir():
            return True
        on_log("Instalando dependencias del frontend (npm install)...")
        try:
            r = subprocess.run(
                ["npm.cmd", "install"],
                cwd=paths.FRONTEND_DIR,
                capture_output=True,
                text=True,
                timeout=300,
                creationflags=_no_window(),
            )
            if r.returncode != 0:
                on_log(f"npm install falló: {r.stderr.strip()[:300]}")
                return False
            on_log("Dependencias del frontend OK.")
            return True
        except (OSError, subprocess.TimeoutExpired) as exc:
            on_log(f"ERROR npm install: {exc}")
            return False

    def start(self, on_log: LogFn = _NOOP, ready_timeout: float = 35.0) -> bool:
        if is_up(port=self.port):
            on_log(f"Frontend ya activo en http://localhost:{self.port}")
            return True
        if not self._ensure_deps(on_log):
            return False
        on_log("Lanzando frontend (npm run dev)...")
        try:
            self.proc = subprocess.Popen(
                ["npm.cmd", "run", "dev", "--", "--host", "0.0.0.0"],
                cwd=paths.FRONTEND_DIR,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=_no_window() | _new_group(),
            )
        except OSError as exc:
            on_log(f"ERROR lanzando vite: {exc}")
            return False

        deadline = time.monotonic() + ready_timeout
        while time.monotonic() < deadline:
            if not self.is_alive():
                on_log("ERROR: vite terminó antes de responder.")
                return False
            if is_up(port=self.port):
                on_log(f"Frontend ACTIVO en http://localhost:{self.port}")
                return True
            time.sleep(0.5)
        on_log("Timeout esperando el frontend.")
        return False

    def stop(self, on_log: LogFn = _NOOP) -> bool:
        if self.proc is None:
            on_log("No hay frontend lanzado por esta GUI.")
            return True
        if self.proc.poll() is not None:
            self.proc = None
            return True
        on_log(f"Deteniendo frontend (PID {self.proc.pid})...")
        try:
            self.proc.terminate()
            self.proc.wait(timeout=6)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            self.proc.wait(timeout=4)
        self.proc = None
        on_log("Frontend detenido.")
        return True
