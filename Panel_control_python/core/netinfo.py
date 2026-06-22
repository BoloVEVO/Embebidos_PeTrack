"""netinfo.py — IP local (la que usan ESP32 y la web del residente)."""
import socket


def local_ip() -> str:
    """Devuelve la IP local de salida (sin tocar la red de verdad)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()
