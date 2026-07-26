"""
frontend_ctrl.py — Levanta/detiene el frontend React (Vite dev server).
"""
from __future__ import annotations

import urllib.request
import subprocess
import time
from typing import Callable

from . import paths
from .process_ctrl import (
    listening_pids, popen_flags, stop_pid_tree, stop_tree,
    stream_output, wait_port_released,
)

LogFn = Callable[[str], None]
_NOOP: LogFn = lambda _m: None
PORT = 5173


def is_up(host: str = "127.0.0.1", port: int = PORT, timeout: float = 1.0) -> bool:
    try:
        with urllib.request.urlopen(f"http://{host}:{port}/", timeout=timeout) as r:
            content_type = r.headers.get("Content-Type", "")
            body = r.read(4096).lower()
            return r.status == 200 and "text/html" in content_type and b'id="root"' in body
    except (OSError, ValueError):
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
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                **popen_flags(),
            )
            stream_output(self.proc.stdout, on_log, "frontend")
        except OSError as exc:
            on_log(f"ERROR lanzando vite: {exc}")
            return False

        deadline = time.monotonic() + ready_timeout
        while time.monotonic() < deadline:
            if not self.is_alive():
                on_log("ERROR: vite terminó antes de responder.")
                self.proc = None
                return False
            if is_up(port=self.port):
                on_log(f"Frontend ACTIVO en http://localhost:{self.port}")
                return True
            time.sleep(0.5)
        on_log("Timeout esperando el frontend.")
        if self.is_alive():
            on_log("Limpiando frontend que no llegó a estar listo...")
            stop_tree(self.proc)
        self.proc = None
        return False

    def stop(self, on_log: LogFn = _NOOP) -> bool:
        if self.proc is None:
            if is_up(port=self.port):
                pids = listening_pids(self.port)
                if not pids:
                    on_log("Frontend externo detectado, pero no se pudo identificar su PID.")
                    return False
                on_log(f"Deteniendo frontend externo (PID {', '.join(map(str, pids))})...")
                results = [stop_pid_tree(pid) for pid in pids]
                released = wait_port_released(lambda: is_up(port=self.port))
                if released:
                    on_log("Frontend externo detenido.")
                    return True
                failed = [str(pid) for pid, ok in zip(pids, results) if not ok]
                on_log("No se pudo detener completamente el frontend externo"
                       + (f" (PID: {', '.join(failed)})." if failed else "."))
                return False
            on_log("Frontend ya está detenido.")
            return True
        if self.proc.poll() is not None:
            self.proc = None
            return True
        on_log(f"Deteniendo frontend (PID {self.proc.pid})...")
        proc, self.proc = self.proc, None
        stop_tree(proc)
        on_log("Frontend detenido.")
        return True
