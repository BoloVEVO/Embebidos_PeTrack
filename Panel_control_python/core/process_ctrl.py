"""Utilidades compartidas para procesos hijos administrados por el panel."""
from __future__ import annotations

import os
import signal
import subprocess
import sys
import threading
import time
from typing import Callable, TextIO

LogFn = Callable[[str], None]


def popen_flags() -> dict:
    """Crea un grupo independiente para poder finalizar todo el árbol."""
    if sys.platform == "win32":
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        flags |= getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        return {"creationflags": flags}
    return {"start_new_session": True}


def stream_output(stream: TextIO | None, on_log: LogFn, prefix: str) -> None:
    """Drena stdout en segundo plano para evitar bloqueos y mostrar diagnósticos."""
    if stream is None:
        return

    def reader() -> None:
        try:
            for line in stream:
                line = line.rstrip()
                if line:
                    on_log(f"[{prefix}] {line}")
        except (OSError, ValueError):
            pass

    threading.Thread(target=reader, daemon=True, name=f"{prefix}-log").start()


def stop_tree(proc: subprocess.Popen, timeout: float = 6.0) -> None:
    """Finaliza el proceso administrado y todos sus descendientes."""
    if proc.poll() is not None:
        return
    if sys.platform == "win32":
        result = subprocess.run(
            ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=timeout,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if result.returncode != 0 and proc.poll() is None:
            proc.kill()
    else:
        try:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    try:
        proc.wait(timeout=2)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=2)


def listening_pids(port: int) -> list[int]:
    """Devuelve los PID que escuchan en un puerto TCP local (Windows)."""
    if sys.platform != "win32" or not 1 <= int(port) <= 65535:
        return []
    command = (
        f"Get-NetTCPConnection -State Listen -LocalPort {int(port)} "
        "-ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique"
    )
    try:
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command],
            capture_output=True,
            text=True,
            timeout=8,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.TimeoutExpired):
        return []
    pids = set()
    for line in result.stdout.splitlines():
        try:
            pid = int(line.strip())
        except ValueError:
            continue
        if pid > 4 and pid != os.getpid():
            pids.add(pid)
    # Get-NetTCPConnection puede requerir permisos adicionales. netstat ofrece
    # el mismo PID sin elevación; no dependemos del idioma de la columna Estado.
    if not pids:
        try:
            netstat = subprocess.run(
                ["netstat", "-ano", "-p", "tcp"],
                capture_output=True,
                text=True,
                timeout=8,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            for line in netstat.stdout.splitlines():
                fields = line.split()
                if len(fields) < 4 or fields[0].upper() != "TCP":
                    continue
                try:
                    local_port = int(fields[1].rsplit(":", 1)[1])
                    pid = int(fields[-1])
                except (ValueError, IndexError):
                    continue
                if local_port == int(port) and pid > 4 and pid != os.getpid():
                    pids.add(pid)
        except (OSError, subprocess.TimeoutExpired):
            pass
    return sorted(pids)


def stop_pid_tree(pid: int, timeout: float = 8.0) -> bool:
    """Termina por PID un árbol externo, limitado a Windows."""
    if sys.platform != "win32" or pid <= 4 or pid == os.getpid():
        return False
    try:
        result = subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=timeout,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        return result.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def wait_port_released(check: Callable[[], bool], timeout: float = 6.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if not check():
            return True
        time.sleep(0.2)
    return not check()
