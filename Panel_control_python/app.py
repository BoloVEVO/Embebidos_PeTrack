"""
app.py — Panel de Control de PetTrack.

Diseño minimalista (tema claro): barra lateral de navegación + rejilla de
tarjetas. Tres vistas: Panel (control), Registros (log) y Guía.

"""
from __future__ import annotations

import queue
import threading
import webbrowser
from datetime import datetime
from typing import Callable

import customtkinter as ctk
import requests

from core import (
    devices,
    esp32_flasher,
    frontend_ctrl,
    netinfo,
    paths,
    server_ctrl,
)

# ── Paleta (clara, minimalista, profesional) ─────────────────────────────────
FONT          = "Segoe UI"
COL_BG        = "#F4F5F7"   # fondo de la zona principal
SIDEBAR       = "#FFFFFF"   # barra lateral
COL_CARD      = "#FFFFFF"   # tarjetas
COL_CARD_2    = "#F1F3F5"   # inputs / botones fantasma
BORDER        = "#E6E8EC"   # bordes sutiles
COL_TEXT      = "#14171C"   # texto principal
COL_MUTED     = "#6B7280"   # texto secundario
COL_ACCENT    = "#16181D"   # primario casi-negro (botones)
COL_ACCENT_DK = "#2C2F36"   # hover del primario
ACCENT_BLUE   = "#2563EB"   # acento (enlaces/realces puntuales)
HOVER         = "#F3F4F6"   # hover sutil de filas
ICON_BG       = "#EEF1F6"   # fondo de los iconos
ICON_FG       = "#465061"   # trazo de los iconos
COL_GREEN     = "#16A34A"
COL_RED       = "#DC2626"
COL_AMBER     = "#D97706"
COL_GREY      = "#C4C9D2"   # punto inactivo

BACKEND_PORT  = 3000
FRONTEND_PORT = 5173


# ── Dibujo de iconos de línea (sin assets externos) ──────────────────────────
def _round_rect(cv, x1, y1, x2, y2, r, **kw):
    pts = [x1 + r, y1, x2 - r, y1, x2, y1, x2, y1 + r, x2, y2 - r, x2, y2,
           x2 - r, y2, x1 + r, y2, x1, y2, x1, y2 - r, x1, y1 + r, x1, y1]
    return cv.create_polygon(pts, smooth=True, **kw)


def _glyph(cv, kind, color, S, pad, w=2):
    """Dibuja un glifo de línea en coordenadas normalizadas (0..24)."""
    def C(v):
        return pad + v / 24.0 * (S - 2 * pad)

    def line(a, b, c, d):
        cv.create_line(C(a), C(b), C(c), C(d), fill=color, width=w, capstyle="round")

    def rect(a, b, c, d):
        cv.create_rectangle(C(a), C(b), C(c), C(d), outline=color, width=w)

    def oval(a, b, c, d):
        cv.create_oval(C(a), C(b), C(c), C(d), outline=color, width=w)

    def dot(cx, cy, r):
        cv.create_oval(C(cx - r), C(cy - r), C(cx + r), C(cy + r), fill=color, outline="")

    if kind == "server":
        rect(3, 4, 21, 10); rect(3, 14, 21, 20); dot(6, 7, 1); dot(6, 17, 1)
    elif kind == "browser":
        rect(3, 4, 21, 20); line(3, 8, 21, 8); dot(6, 6, 0.8); dot(9, 6, 0.8)
    elif kind == "camera":
        rect(2, 8, 22, 20); rect(8, 4, 16, 8); oval(8, 11, 16, 19)
    elif kind == "chip":
        rect(6, 6, 18, 18); rect(10, 10, 14, 14)
        for v in (9, 12, 15):
            line(v, 6, v, 3); line(v, 18, v, 21); line(6, v, 3, v); line(18, v, 21, v)
    elif kind == "network":
        oval(9, 2, 15, 8); oval(2, 17, 8, 23); oval(16, 17, 22, 23)
        line(11, 8, 6, 17); line(13, 8, 18, 17)
    elif kind == "power":
        cv.create_arc(C(4), C(4), C(20), C(20), start=125, extent=290,
                      style="arc", outline=color, width=w)
        line(12, 3, 12, 12)
    elif kind == "panel":
        rect(3, 3, 10, 10); rect(14, 3, 21, 10); rect(3, 14, 10, 21); rect(14, 14, 21, 21)
    elif kind == "logs":
        line(4, 7, 20, 7); line(4, 12, 20, 12); line(4, 17, 20, 17)
    elif kind == "guide":
        rect(5, 3, 19, 21); line(12, 3, 12, 21)


def make_icon(master, kind, card_bg=COL_CARD, S=44):
    cv = ctk.CTkCanvas(master, width=S, height=S, bg=card_bg, highlightthickness=0)
    _round_rect(cv, 0, 0, S, S, 12, fill=ICON_BG, outline="")
    _glyph(cv, kind, ICON_FG, S, pad=11, w=2)
    return cv


# ── Tarjeta ──────────────────────────────────────────────────────────────────
class Card(ctk.CTkFrame):
    """Tarjeta blanca con icono, título, estado (punto + texto) y cuerpo libre."""

    def __init__(self, master, kind: str, title: str, subtitle: str = "", **kw) -> None:
        super().__init__(master, fg_color=COL_CARD, corner_radius=14,
                         border_color=BORDER, border_width=1, **kw)
        self.grid_columnconfigure(0, weight=1)

        head = ctk.CTkFrame(self, fg_color="transparent")
        head.grid(row=0, column=0, sticky="ew", padx=18, pady=(16, 8))
        head.grid_columnconfigure(1, weight=1)

        make_icon(head, kind).grid(row=0, column=0, rowspan=2 if subtitle else 1)

        ctk.CTkLabel(head, text=title, font=(FONT, 15, "bold"),
                     text_color=COL_TEXT).grid(row=0, column=1, sticky="w", padx=(12, 0))
        if subtitle:
            ctk.CTkLabel(head, text=subtitle, font=(FONT, 11),
                         text_color=COL_MUTED).grid(row=1, column=1, sticky="w", padx=(12, 0))

        st = ctk.CTkFrame(head, fg_color="transparent")
        st.grid(row=0, column=2, rowspan=2 if subtitle else 1, sticky="e")
        self.dot = ctk.CTkCanvas(st, width=10, height=10, bg=COL_CARD, highlightthickness=0)
        self._dot_id = self.dot.create_oval(1, 1, 9, 9, fill=COL_GREY, outline="")
        self.dot.grid(row=0, column=0, padx=(0, 6))
        self.state_lbl = ctk.CTkLabel(st, text="—", font=(FONT, 11), text_color=COL_MUTED)
        self.state_lbl.grid(row=0, column=1)

        self.body = ctk.CTkFrame(self, fg_color="transparent")
        self.body.grid(row=1, column=0, sticky="nsew", padx=18, pady=(0, 16))
        self.body.grid_columnconfigure(0, weight=1)

    def set_state(self, color: str, text: str) -> None:
        self.dot.itemconfig(self._dot_id, fill=color)
        self.state_lbl.configure(text=text, text_color=COL_MUTED)


# ── Elemento de navegación (fila clicable de la barra lateral) ───────────────
class NavItem(ctk.CTkFrame):
    def __init__(self, master, kind: str, text: str, command: Callable[[], None]) -> None:
        super().__init__(master, fg_color="transparent", corner_radius=10, height=40)
        self.command = command
        self.kind = kind
        self.active = False
        self._hover = False
        self.grid_propagate(False)
        self.grid_columnconfigure(1, weight=1)

        self.cv = ctk.CTkCanvas(self, width=22, height=22, bg=SIDEBAR, highlightthickness=0)
        self.cv.grid(row=0, column=0, padx=(12, 10), pady=9)
        self.lbl = ctk.CTkLabel(self, text=text, font=(FONT, 13), text_color=COL_MUTED)
        self.lbl.grid(row=0, column=1, sticky="w")

        for w in (self, self.cv, self.lbl):
            w.bind("<Button-1>", lambda _e: self.command())
            w.bind("<Enter>", self._on_enter)
            w.bind("<Leave>", self._on_leave)
        self._apply()

    def _on_enter(self, _e=None):
        self._hover = True
        self._apply()

    def _on_leave(self, _e=None):
        self._hover = False
        self._apply()

    def set_active(self, on: bool) -> None:
        self.active = on
        self._apply()

    def _apply(self) -> None:
        if self.active:
            bg, col, weight = HOVER, COL_TEXT, "bold"
        elif self._hover:
            bg, col, weight = "#FAFAFB", COL_TEXT, "normal"
        else:
            bg, col, weight = "transparent", COL_MUTED, "normal"
        self.configure(fg_color=bg)
        cvbg = SIDEBAR if bg == "transparent" else bg
        self.cv.configure(bg=cvbg)
        self.cv.delete("all")
        _glyph(self.cv, self.kind, col, 22, pad=1, w=2)
        self.lbl.configure(text_color=col, font=(FONT, 13, weight))


class PetTrackPanel(ctk.CTk):
    def __init__(self) -> None:
        super().__init__()
        ctk.set_appearance_mode("light")
        self.title("PetTrack · Panel de Control")
        self.geometry("1180x820")
        self.minsize(1040, 720)
        self.configure(fg_color=COL_BG)

        self.backend = server_ctrl.BackendController(port=BACKEND_PORT)
        self.frontend = frontend_ctrl.FrontendController(port=FRONTEND_PORT)
        self.local_ip = netinfo.local_ip()
        self._ui_q: queue.Queue[Callable[[], None]] = queue.Queue()
        self._busy = {"backend": False, "frontend": False,
                      "device": False, "collar": False}
        self._nav: dict[str, NavItem] = {}
        self._views: dict[str, ctk.CTkBaseClass] = {}

        self._build()
        self._nav_to("panel")
        self._start_pump()
        self._start_health_loop()
        self._start_ports_loop()
        self.protocol("WM_DELETE_WINDOW", self._on_close)

    # ============================================================= layout #
    def _build(self) -> None:
        self.grid_columnconfigure(0, weight=0)
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)

        self._build_sidebar()

        main = ctk.CTkFrame(self, fg_color=COL_BG)
        main.grid(row=0, column=1, sticky="nsew")
        main.grid_rowconfigure(0, weight=1)
        main.grid_rowconfigure(1, weight=0)
        main.grid_columnconfigure(0, weight=1)

        content = ctk.CTkFrame(main, fg_color=COL_BG)
        content.grid(row=0, column=0, sticky="nsew")
        content.grid_rowconfigure(0, weight=1)
        content.grid_columnconfigure(0, weight=1)
        self._content = content

        # Barra de estado inferior (visible en todas las vistas)
        bar = ctk.CTkFrame(main, fg_color=SIDEBAR, corner_radius=0, height=36,
                           border_color=BORDER, border_width=1)
        bar.grid(row=1, column=0, sticky="ew")
        bar.grid_propagate(False)
        bar.grid_columnconfigure(0, weight=1)
        self.status_line = ctk.CTkLabel(bar, text="Listo.", font=(FONT, 11),
                                        text_color=COL_MUTED, anchor="w")
        self.status_line.grid(row=0, column=0, sticky="w", padx=18)

        self._build_panel_view()
        self._build_logs_view()
        self._build_guide_view()

        self.log("Panel iniciado.")
        self.log(f"IP local: {self.local_ip}")

    # --- Barra lateral ------------------------------------------------- #
    def _build_sidebar(self) -> None:
        side = ctk.CTkFrame(self, width=232, fg_color=SIDEBAR, corner_radius=0,
                            border_color=BORDER, border_width=1)
        side.grid(row=0, column=0, sticky="nsew")
        side.grid_propagate(False)
        side.grid_columnconfigure(0, weight=1)
        side.grid_rowconfigure(2, weight=1)  # espaciador

        # Marca
        brand = ctk.CTkFrame(side, fg_color="transparent")
        brand.grid(row=0, column=0, sticky="ew", padx=18, pady=(20, 18))
        logo = ctk.CTkCanvas(brand, width=32, height=32, bg=SIDEBAR, highlightthickness=0)
        _round_rect(logo, 0, 0, 32, 32, 9, fill=COL_ACCENT, outline="")
        _glyph(logo, "network", "#FFFFFF", 32, pad=8, w=2)
        logo.grid(row=0, column=0, rowspan=2, padx=(0, 10))
        ctk.CTkLabel(brand, text="PetTrack", font=(FONT, 16, "bold"),
                     text_color=COL_TEXT).grid(row=0, column=1, sticky="w")
        ctk.CTkLabel(brand, text="Panel de control", font=(FONT, 11),
                     text_color=COL_MUTED).grid(row=1, column=1, sticky="w")

        # Navegación
        nav = ctk.CTkFrame(side, fg_color="transparent")
        nav.grid(row=1, column=0, sticky="ew", padx=12)
        nav.grid_columnconfigure(0, weight=1)
        for i, (key, kind, text) in enumerate((
            ("panel", "panel", "Panel"),
            ("logs", "logs", "Registros"),
            ("guide", "guide", "Guía"),
        )):
            item = NavItem(nav, kind, text, lambda k=key: self._nav_to(k))
            item.grid(row=i, column=0, sticky="ew", pady=2)
            self._nav[key] = item

        # Estado global
        block = ctk.CTkFrame(side, fg_color="transparent")
        block.grid(row=3, column=0, sticky="ew", padx=18, pady=(0, 6))
        block.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(block, text="ESTADO", font=(FONT, 10, "bold"),
                     text_color=COL_MUTED).grid(row=0, column=0, sticky="w", pady=(0, 6))
        self.side_back = self._side_status_row(block, 1, "Backend")
        self.side_front = self._side_status_row(block, 2, "Frontend")
        self.side_dev = self._side_status_row(block, 3, "Dispositivos")

        # Pie: IP + versión
        foot = ctk.CTkFrame(side, fg_color="transparent")
        foot.grid(row=4, column=0, sticky="ew", padx=18, pady=(8, 18))
        foot.grid_columnconfigure(0, weight=1)
        ctk.CTkFrame(foot, fg_color=BORDER, height=1).grid(
            row=0, column=0, sticky="ew", pady=(0, 12))
        ctk.CTkLabel(foot, text="IP local de la PC", font=(FONT, 11),
                     text_color=COL_MUTED).grid(row=1, column=0, sticky="w")
        ctk.CTkLabel(foot, text=self.local_ip, font=(FONT, 15, "bold"),
                     text_color=COL_TEXT).grid(row=2, column=0, sticky="w")

    def _side_status_row(self, master, row, text):
        r = ctk.CTkFrame(master, fg_color="transparent")
        r.grid(row=row, column=0, sticky="ew", pady=3)
        cv = ctk.CTkCanvas(r, width=10, height=10, bg=SIDEBAR, highlightthickness=0)
        oid = cv.create_oval(1, 1, 9, 9, fill=COL_GREY, outline="")
        cv.grid(row=0, column=0, padx=(0, 8))
        lbl = ctk.CTkLabel(r, text=text, font=(FONT, 12), text_color=COL_TEXT)
        lbl.grid(row=0, column=1, sticky="w")
        return (cv, oid)

    def _set_side(self, ref, color: str) -> None:
        cv, oid = ref
        cv.itemconfig(oid, fill=color)

    def _nav_to(self, key: str) -> None:
        for view in self._views.values():
            view.grid_remove()
        self._views[key].grid(row=0, column=0, sticky="nsew")
        for k, item in self._nav.items():
            item.set_active(k == key)

    # --- Vista Panel --------------------------------------------------- #
    def _build_panel_view(self) -> None:
        view = ctk.CTkScrollableFrame(self._content, fg_color=COL_BG,
                                      scrollbar_button_color=COL_GREY,
                                      scrollbar_button_hover_color=COL_MUTED)
        view.grid_columnconfigure(0, weight=1, uniform="col")
        view.grid_columnconfigure(1, weight=1, uniform="col")
        self._views["panel"] = view

        header = ctk.CTkFrame(view, fg_color="transparent")
        header.grid(row=0, column=0, columnspan=2, sticky="ew", padx=8, pady=(8, 4))
        header.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(header, text="Panel de control", font=(FONT, 24, "bold"),
                     text_color=COL_TEXT).grid(row=0, column=0, sticky="w")
        ctk.CTkLabel(header, text="Backend, frontend y microcontroladores del sistema PetTrack.",
                     font=(FONT, 13), text_color=COL_MUTED).grid(row=1, column=0, sticky="w",
                                                                 pady=(2, 0))

        self.p_sys = Card(view, "power", "Control del sistema",
                          "Levanta o detiene todo de una vez.")
        self.p_back = Card(view, "server", "Backend", "API de Node en :3000")
        self.p_front = Card(view, "browser", "Frontend", "Web de React en :5173")
        self.p_dev = Card(view, "camera", "Dispositivo", "ESP32-CAM de residencia")
        self.p_col = Card(view, "chip", "Collar", "Baliza BLE ESP32-C3")
        self.p_net = Card(view, "network", "Red", "Conectividad y dispositivos")

        self.p_sys.grid(row=1, column=0, columnspan=2, sticky="nsew", padx=8, pady=8)
        self.p_back.grid(row=2, column=0, sticky="nsew", padx=8, pady=8)
        self.p_front.grid(row=2, column=1, sticky="nsew", padx=8, pady=8)
        self.p_dev.grid(row=3, column=0, sticky="nsew", padx=8, pady=8)
        self.p_col.grid(row=3, column=1, sticky="nsew", padx=8, pady=8)
        self.p_net.grid(row=4, column=0, columnspan=2, sticky="nsew", padx=8, pady=8)

        self._build_sys()
        self._build_back()
        self._build_front()
        self._build_device_panel()
        self._build_flash_panel(self.p_col, paths.COLLAR_DIR, "collar",
                                "Flashear collar")
        self._build_net()

    def _btn(self, master, text, cmd, primary=True, **kw):
        if primary:
            return ctk.CTkButton(master, text=text, command=cmd,
                                 fg_color=COL_ACCENT, hover_color=COL_ACCENT_DK,
                                 text_color="#FFFFFF", font=(FONT, 13, "bold"),
                                 corner_radius=10, height=38, **kw)
        return ctk.CTkButton(master, text=text, command=cmd,
                             fg_color=COL_CARD_2, hover_color=HOVER,
                             text_color=COL_TEXT, border_color=BORDER, border_width=1,
                             font=(FONT, 13), corner_radius=10, height=38, **kw)

    def _entry(self, master, placeholder, show=None):
        return ctk.CTkEntry(master, placeholder_text=placeholder, show=show,
                            fg_color=COL_CARD_2, border_color=BORDER, border_width=1,
                            text_color=COL_TEXT, placeholder_text_color=COL_MUTED,
                            corner_radius=10, height=34)

    def _optmenu(self, master, **kw):
        return ctk.CTkOptionMenu(master, fg_color=COL_CARD_2, button_color=COL_ACCENT,
                                 button_hover_color=COL_ACCENT_DK, text_color=COL_TEXT,
                                 dropdown_fg_color=COL_CARD, dropdown_text_color=COL_TEXT,
                                 dropdown_hover_color=HOVER, corner_radius=10, **kw)

    def _label(self, master, text):
        return ctk.CTkLabel(master, text=text, font=(FONT, 11), text_color=COL_MUTED)

    # --- Tarjeta Sistema ---------------------------------------------- #
    def _build_sys(self) -> None:
        b = self.p_sys.body
        self.p_sys.set_state(COL_GREY, "en espera")
        row = ctk.CTkFrame(b, fg_color="transparent")
        row.grid(row=0, column=0, sticky="ew")
        row.grid_columnconfigure((0, 1, 2), weight=1)
        self.btn_all_up = self._btn(row, "Levantar todo", self._on_all_up)
        self.btn_all_down = self._btn(row, "Detener", self._on_all_down, primary=False)
        self.btn_open_web = self._btn(row, "Abrir web", self._on_open_web, primary=False)
        self.btn_all_up.grid(row=0, column=0, sticky="ew", padx=(0, 6))
        self.btn_all_down.grid(row=0, column=1, sticky="ew", padx=6)
        self.btn_open_web.grid(row=0, column=2, sticky="ew", padx=(6, 0))

        self.lbl_sys_summary = ctk.CTkLabel(
            b, text="Instala dependencias si faltan, arranca backend y frontend, y valida que respondan.",
            font=(FONT, 12), text_color=COL_MUTED, justify="left", wraplength=860)
        self.lbl_sys_summary.grid(row=1, column=0, sticky="w", pady=(12, 0))

    # --- Tarjeta Backend ---------------------------------------------- #
    def _build_back(self) -> None:
        b = self.p_back.body
        self.p_back.set_state(COL_GREY, "comprobando")
        row = ctk.CTkFrame(b, fg_color="transparent")
        row.grid(row=0, column=0, sticky="ew")
        row.grid_columnconfigure((0, 1), weight=1)
        self.btn_b_up = self._btn(row, "Montar", lambda: self._async_backend(True))
        self.btn_b_dn = self._btn(row, "Detener", lambda: self._async_backend(False), primary=False)
        self.btn_b_up.grid(row=0, column=0, sticky="ew", padx=(0, 6))
        self.btn_b_dn.grid(row=0, column=1, sticky="ew", padx=(6, 0))
        self.lbl_b_url = ctk.CTkLabel(b, text=f"http://localhost:{BACKEND_PORT}",
                                      font=(FONT, 11), text_color=COL_MUTED)
        self.lbl_b_url.grid(row=1, column=0, sticky="w", pady=(10, 0))

    # --- Tarjeta Frontend --------------------------------------------- #
    def _build_front(self) -> None:
        b = self.p_front.body
        self.p_front.set_state(COL_GREY, "comprobando")
        row = ctk.CTkFrame(b, fg_color="transparent")
        row.grid(row=0, column=0, sticky="ew")
        row.grid_columnconfigure((0, 1), weight=1)
        self.btn_f_up = self._btn(row, "Montar", lambda: self._async_frontend(True))
        self.btn_f_dn = self._btn(row, "Detener", lambda: self._async_frontend(False), primary=False)
        self.btn_f_up.grid(row=0, column=0, sticky="ew", padx=(0, 6))
        self.btn_f_dn.grid(row=0, column=1, sticky="ew", padx=(6, 0))
        self.lbl_f_url = ctk.CTkLabel(b, text=f"http://localhost:{FRONTEND_PORT}",
                                      font=(FONT, 11), text_color=COL_MUTED)
        self.lbl_f_url.grid(row=1, column=0, sticky="w", pady=(10, 0))

    # --- Tarjeta ESP32-CAM (con inyección de WiFi + IP) --------------- #
    def _build_device_panel(self) -> None:
        b = self.p_dev.body
        self.p_dev.set_state(COL_GREY, "USB no detectado")

        self._label(b, "Red WiFi (2.4 GHz)").grid(row=0, column=0, sticky="w")
        self.entry_ssid = self._entry(b, "Nombre de la red")
        self.entry_ssid.grid(row=1, column=0, sticky="ew", pady=(2, 8))

        self._label(b, "Contraseña").grid(row=2, column=0, sticky="w")
        self.entry_dev_pass = self._entry(b, "Contraseña WiFi", show="*")
        self.entry_dev_pass.grid(row=3, column=0, sticky="ew", pady=(2, 8))

        ctk.CTkLabel(
            b, text=f"Backend http://{self.local_ip}:{BACKEND_PORT} se inyecta al flashear.",
            font=(FONT, 11), text_color=COL_MUTED, wraplength=420, justify="left",
        ).grid(row=4, column=0, sticky="w", pady=(0, 8))

        self._label(b, "Puerto COM").grid(row=5, column=0, sticky="w")
        opt = self._optmenu(b, values=["(detectando…)"], width=240)
        opt.grid(row=6, column=0, sticky="w", pady=(2, 0))

        btn = self._btn(b, "Flashear dispositivo", lambda: self._async_flash_device(opt))
        btn.grid(row=7, column=0, sticky="ew", pady=(12, 0))
        btn.configure(state="disabled")

        self.opt_device = opt
        self.btn_device = btn
        self.panel_device = self.p_dev

    # --- Tarjeta de flasheo genérico (collar) ------------------------- #
    def _build_flash_panel(self, panel: Card, project_dir, key: str, label: str) -> None:
        b = panel.body
        panel.set_state(COL_GREY, "USB no detectado")
        self._label(b, "Puerto COM").grid(row=0, column=0, sticky="w")
        opt = self._optmenu(b, values=["(detectando…)"], width=240)
        opt.grid(row=1, column=0, sticky="w", pady=(2, 0))
        btn = self._btn(b, label, lambda: self._async_flash(project_dir, key, opt))
        btn.grid(row=2, column=0, sticky="ew", pady=(12, 0))
        btn.configure(state="disabled")
        setattr(self, f"opt_{key}", opt)
        setattr(self, f"btn_{key}", btn)
        setattr(self, f"panel_{key}", panel)

    # --- Tarjeta Red --------------------------------------------------- #
    def _build_net(self) -> None:
        b = self.p_net.body
        self.p_net.set_state(COL_AMBER, "esperando")
        ctk.CTkLabel(
            b, text=f"Configura los dispositivos contra http://{self.local_ip}:{BACKEND_PORT}",
            font=(FONT, 12), text_color=COL_MUTED, wraplength=860, justify="left",
        ).grid(row=0, column=0, sticky="w")
        self.lbl_devices = ctk.CTkLabel(b, text="Sin datos del backend.",
                                        font=(FONT, 12), text_color=COL_TEXT, justify="left")
        self.lbl_devices.grid(row=1, column=0, sticky="w", pady=(10, 0))

    # --- Vista Registros ---------------------------------------------- #
    def _build_logs_view(self) -> None:
        view = ctk.CTkFrame(self._content, fg_color=COL_BG)
        view.grid_columnconfigure(0, weight=1)
        view.grid_rowconfigure(1, weight=1)
        self._views["logs"] = view

        ctk.CTkLabel(view, text="Registros", font=(FONT, 24, "bold"),
                     text_color=COL_TEXT).grid(row=0, column=0, sticky="w",
                                               padx=24, pady=(24, 12))
        self.log_box = ctk.CTkTextbox(view, fg_color=COL_CARD, text_color="#3A4150",
                                      font=("Consolas", 12), border_color=BORDER,
                                      border_width=1, corner_radius=12)
        self.log_box.grid(row=1, column=0, sticky="nsew", padx=24, pady=(0, 24))
        self.log_box.configure(state="disabled")

    # --- Vista Guía ---------------------------------------------------- #
    def _build_guide_view(self) -> None:
        view = ctk.CTkScrollableFrame(self._content, fg_color=COL_BG,
                                      scrollbar_button_color=COL_GREY,
                                      scrollbar_button_hover_color=COL_MUTED)
        view.grid_columnconfigure(0, weight=1)
        self._views["guide"] = view

        ctk.CTkLabel(view, text="Guía rápida", font=(FONT, 24, "bold"),
                     text_color=COL_TEXT).grid(row=0, column=0, sticky="w", padx=8, pady=(8, 4))
        ctk.CTkLabel(view, text="Del arranque a la primera detección.",
                     font=(FONT, 13), text_color=COL_MUTED).grid(row=1, column=0, sticky="w",
                                                                 padx=8, pady=(0, 8))

        steps = [
            ("1. Levantar el sistema",
             "En Panel pulsa “Levantar todo”. Espera a que Backend y Frontend queden en verde."),
            ("2. Flashear el dispositivo",
             "Conecta la ESP32-CAM por USB. En la tarjeta Dispositivo escribe tu red WiFi y "
             "contraseña; el backend se inyecta solo. Pulsa “Flashear dispositivo”."),
            ("3. Flashear el collar",
             "Conecta la ESP32-C3 por USB y pulsa “Flashear collar”."),
            ("4. Probar",
             "Abre la web, registra la mascota y acerca el collar al dispositivo: aparece la "
             "detección con foto. Desde la pestaña Staff puedes resolver el reporte."),
        ]
        for i, (title, body) in enumerate(steps):
            card = ctk.CTkFrame(view, fg_color=COL_CARD, corner_radius=14,
                                border_color=BORDER, border_width=1)
            card.grid(row=2 + i, column=0, sticky="ew", padx=8, pady=8)
            card.grid_columnconfigure(0, weight=1)
            ctk.CTkLabel(card, text=title, font=(FONT, 14, "bold"),
                         text_color=COL_TEXT).grid(row=0, column=0, sticky="w",
                                                   padx=18, pady=(14, 2))
            ctk.CTkLabel(card, text=body, font=(FONT, 12), text_color=COL_MUTED,
                         justify="left", wraplength=820).grid(row=1, column=0, sticky="w",
                                                              padx=18, pady=(0, 14))

    # ============================================================ threading #
    def _post(self, fn: Callable[[], None]) -> None:
        self._ui_q.put(fn)

    def _start_pump(self) -> None:
        def pump():
            try:
                while True:
                    self._ui_q.get_nowait()()
            except queue.Empty:
                pass
            except Exception as e:  # noqa: BLE001
                self._append_log(f"[UI] error: {e}")
            self.after(60, pump)
        self.after(60, pump)

    def log(self, msg: str) -> None:
        self._post(lambda: self._append_log(msg))

    def _append_log(self, msg: str) -> None:
        ts = datetime.now().strftime("%H:%M:%S")
        self.log_box.configure(state="normal")
        self.log_box.insert("end", f"[{ts}] {msg}\n")
        self.log_box.see("end")
        self.log_box.configure(state="disabled")
        if hasattr(self, "status_line"):
            self.status_line.configure(text=msg)

    # ============================================================== health #
    def _start_health_loop(self) -> None:
        def worker():
            while True:
                b = server_ctrl.is_healthy(port=BACKEND_PORT)
                f = frontend_ctrl.is_up(port=FRONTEND_PORT)
                devs = self._query_devices() if b else None
                self._post(lambda b=b, f=f, d=devs: self._apply_health(b, f, d))
                threading.Event().wait(3.0)
        threading.Thread(target=worker, daemon=True).start()

    def _query_devices(self) -> dict | None:
        try:
            r = requests.get(f"http://localhost:{BACKEND_PORT}/device/status", timeout=1.5)
            return r.json().get("devices", {}) if r.status_code == 200 else None
        except requests.RequestException:
            return None

    def _apply_health(self, backend_ok: bool, frontend_ok: bool, devs: dict | None) -> None:
        # Backend
        if backend_ok:
            self.p_back.set_state(COL_GREEN, "activo")
            self.lbl_b_url.configure(text=f"Activo · http://localhost:{BACKEND_PORT}",
                                     text_color=COL_GREEN)
            self._set_side(self.side_back, COL_GREEN)
        else:
            self.p_back.set_state(COL_RED, "detenido")
            self.lbl_b_url.configure(text=f"Detenido · http://localhost:{BACKEND_PORT}",
                                     text_color=COL_MUTED)
            self._set_side(self.side_back, COL_RED)
        # Frontend
        if frontend_ok:
            self.p_front.set_state(COL_GREEN, "activo")
            self.lbl_f_url.configure(text=f"Activo · http://localhost:{FRONTEND_PORT}",
                                     text_color=COL_GREEN)
            self._set_side(self.side_front, COL_GREEN)
        else:
            self.p_front.set_state(COL_RED, "detenido")
            self.lbl_f_url.configure(text=f"Detenido · http://localhost:{FRONTEND_PORT}",
                                     text_color=COL_MUTED)
            self._set_side(self.side_front, COL_RED)
        # Sistema (resumen)
        if backend_ok and frontend_ok:
            self.p_sys.set_state(COL_GREEN, "todo activo")
            self.lbl_sys_summary.configure(
                text=f"Backend y frontend activos. Abre http://localhost:{FRONTEND_PORT}",
                text_color=COL_GREEN)
        elif backend_ok or frontend_ok:
            self.p_sys.set_state(COL_AMBER, "parcial")
            self.lbl_sys_summary.configure(text="Falta un servicio. Revisa su tarjeta.",
                                           text_color=COL_AMBER)
        else:
            self.p_sys.set_state(COL_GREY, "detenido")
            self.lbl_sys_summary.configure(text="Sistema detenido.", text_color=COL_MUTED)
        # Dispositivos (heartbeats)
        if devs is None:
            self.p_net.set_state(COL_GREY, "backend caído")
            self.lbl_devices.configure(text="Sin datos del backend.", text_color=COL_MUTED)
            self._set_side(self.side_dev, COL_GREY)
        elif not devs:
            self.p_net.set_state(COL_AMBER, "0 dispositivos")
            self.lbl_devices.configure(text="No hay dispositivos reportando aún.",
                                       text_color=COL_MUTED)
            self._set_side(self.side_dev, COL_AMBER)
        else:
            online = sum(1 for d in devs.values() if d.get("online"))
            color = COL_GREEN if online == len(devs) else COL_AMBER
            self.p_net.set_state(color, f"{online}/{len(devs)} en línea")
            self._set_side(self.side_dev, color if online else COL_RED)
            lines = []
            for name, info in devs.items():
                state = "en línea" if info.get("online") else "desconectado"
                rssi = info.get("wifi_rssi")
                fw = info.get("fw", "?")
                line = f"{name}   ·   {state}   ·   fw {fw}"
                if rssi is not None:
                    line += f"   ·   RSSI {rssi} dBm"
                lines.append(line)
            self.lbl_devices.configure(text="\n".join(lines), text_color=COL_TEXT)

    # ============================================================= puertos #
    def _start_ports_loop(self) -> None:
        def worker():
            while True:
                ports = devices.list_esp32_ports()
                self._post(lambda p=ports: self._apply_ports(p))
                threading.Event().wait(3.0)
        threading.Thread(target=worker, daemon=True).start()

    def _apply_ports(self, ports) -> None:
        labels = [f"{p.device} — {p.description}" for p in ports] or ["(ninguno)"]
        values = [p.device for p in ports] or [""]
        for key, panel in (("device", self.panel_device), ("collar", self.panel_collar)):
            opt: ctk.CTkOptionMenu = getattr(self, f"opt_{key}")
            btn: ctk.CTkButton = getattr(self, f"btn_{key}")
            current = opt.get()
            opt.configure(values=labels)
            if current not in labels:
                opt.set(labels[0])
            if values[0] and not self._busy[key]:
                panel.set_state(COL_GREEN, f"{len(ports)} puerto(s)")
                btn.configure(state="normal")
            elif not self._busy[key]:
                panel.set_state(COL_GREY, "USB no detectado")
                btn.configure(state="disabled")

    # ============================================================ acciones #
    def _async_backend(self, up: bool) -> None:
        if self._busy["backend"]:
            return
        self._busy["backend"] = True
        self.btn_b_up.configure(state="disabled")
        self.btn_b_dn.configure(state="disabled")

        def work():
            ok = (self.backend.start(on_log=self.log)
                  if up else self.backend.stop(on_log=self.log))
            def done():
                self._busy["backend"] = False
                self.btn_b_up.configure(state="normal")
                self.btn_b_dn.configure(state="normal")
            self._post(done)
            _ = ok
        threading.Thread(target=work, daemon=True).start()

    def _async_frontend(self, up: bool) -> None:
        if self._busy["frontend"]:
            return
        self._busy["frontend"] = True
        self.btn_f_up.configure(state="disabled")
        self.btn_f_dn.configure(state="disabled")

        def work():
            ok = (self.frontend.start(on_log=self.log)
                  if up else self.frontend.stop(on_log=self.log))
            def done():
                self._busy["frontend"] = False
                self.btn_f_up.configure(state="normal")
                self.btn_f_dn.configure(state="normal")
            self._post(done)
            _ = ok
        threading.Thread(target=work, daemon=True).start()

    def _on_all_up(self) -> None:
        self.log("Levantar todo")
        self.btn_all_up.configure(state="disabled")
        self._async_backend(True)
        self._async_frontend(True)
        def re_enable():
            if not (self._busy["backend"] or self._busy["frontend"]):
                self.btn_all_up.configure(state="normal")
            else:
                self.after(500, re_enable)
        self.after(500, re_enable)

    def _on_all_down(self) -> None:
        self.log("Detener todo")
        self._async_backend(False)
        self._async_frontend(False)

    def _on_open_web(self) -> None:
        webbrowser.open(f"http://localhost:{FRONTEND_PORT}")

    def _async_flash(self, project_dir, key: str, opt: ctk.CTkOptionMenu) -> None:
        if self._busy[key]:
            return
        label = opt.get()
        port = label.split(" — ")[0].strip()
        if not port or port == "(ninguno)":
            self.log("No hay puerto COM seleccionado.")
            return
        self._busy[key] = True
        btn: ctk.CTkButton = getattr(self, f"btn_{key}")
        panel: Card = getattr(self, f"panel_{key}")
        btn.configure(state="disabled", text="Flasheando…")
        panel.set_state(COL_AMBER, "flasheando")
        self.log(f"Flashear {project_dir.name} en {port}")

        def work():
            ok = esp32_flasher.flash(project_dir, port, on_log=self.log)
            def done():
                self._busy[key] = False
                btn.configure(text="Flashear dispositivo"
                              if key == "device" else "Flashear collar")
                panel.set_state(COL_GREEN if ok else COL_RED,
                                "flasheado" if ok else "error")
                btn.configure(state="normal")
            self._post(done)
        threading.Thread(target=work, daemon=True).start()

    def _async_flash_device(self, opt: ctk.CTkOptionMenu) -> None:
        """Flashea el ESP32-CAM inyectando WiFi y la IP del backend antes de compilar."""
        if self._busy["device"]:
            return
        label = opt.get()
        port = label.split(" — ")[0].strip()
        if not port or port == "(ninguno)":
            self.log("No hay puerto COM seleccionado.")
            return

        ssid = self.entry_ssid.get().strip()
        wifi_pass = self.entry_dev_pass.get()
        backend_url = f"http://{self.local_ip}:{BACKEND_PORT}"

        if not ssid:
            self.log("Aviso: SSID vacío — el ESP32-CAM no podrá conectarse a la red.")

        self._busy["device"] = True
        self.btn_device.configure(state="disabled", text="Flasheando…")
        self.p_dev.set_state(COL_AMBER, "flasheando")
        self.log(f"Flashear ESP32-CAM en {port}")
        self.log(f"  Backend inyectado: {backend_url}")
        if ssid:
            self.log(f"  WiFi inyectado: {ssid}")

        def work():
            changes = esp32_flasher.patch_config(
                paths.DEVICE_DIR,
                backend_host=backend_url,
                wifi_ssid=ssid or None,
                wifi_pass=wifi_pass or None,
            )
            for c in changes:
                self.log(f"  config.h: {c}")

            ok = esp32_flasher.flash(paths.DEVICE_DIR, port, on_log=self.log)

            def done():
                self._busy["device"] = False
                self.btn_device.configure(text="Flashear dispositivo", state="normal")
                self.p_dev.set_state(COL_GREEN if ok else COL_RED,
                                     "flasheado" if ok else "error")
            self._post(done)

        threading.Thread(target=work, daemon=True).start()

    def _on_close(self) -> None:
        try:
            if self.backend.is_alive():
                self.log("Cerrando: deteniendo backend lanzado por la GUI…")
                self.backend.stop(on_log=lambda m: None)
            if self.frontend.is_alive():
                self.log("Cerrando: deteniendo frontend lanzado por la GUI…")
                self.frontend.stop(on_log=lambda m: None)
        finally:
            self.destroy()


def main() -> None:
    PetTrackPanel().mainloop()


if __name__ == "__main__":
    main()
