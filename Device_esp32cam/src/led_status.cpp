// led_status.cpp — Máquina de estados no bloqueante para el LED GPIO 33.
#include "led_status.h"

namespace led {

enum class Mode { OFF, SOLID, BLINK_FAST };

static Mode     s_mode       = Mode::OFF;
static bool     s_ledOn      = false;
static uint32_t s_lastToggle = 0;
static uint32_t s_pulseEnd   = 0;

static inline void _write(bool on) {
  digitalWrite(LED_STATUS_PIN, on ? LOW : HIGH);  // activo en LOW
}

void begin() {
  pinMode(LED_STATUS_PIN, OUTPUT);
  _write(false);
}

void setConnecting() {
  s_mode = Mode::BLINK_FAST;
}

void setConnected() {
  s_mode = Mode::SOLID;
  _write(true);
}

void setDisconnected() {
  s_mode = Mode::OFF;
  _write(false);
}

void pulse() {
  // Destello doble rápido (300 ms) para confirmar detección; no interrumpe estados.
  s_pulseEnd = millis() + 300;
}

void update() {
  uint32_t now = millis();

  // Destello de evento: tiene prioridad mientras dure
  if (s_pulseEnd) {
    if (now < s_pulseEnd) {
      _write((now / 75) % 2 == 0);
      return;
    }
    s_pulseEnd = 0;
    // Restaurar estado base al terminar el pulso
    if (s_mode == Mode::SOLID) _write(true);
    if (s_mode == Mode::OFF)   _write(false);
  }

  switch (s_mode) {
    case Mode::OFF:
      _write(false);
      break;
    case Mode::SOLID:
      _write(true);
      break;
    case Mode::BLINK_FAST:
      if (now - s_lastToggle >= 200) {
        s_lastToggle = now;
        s_ledOn = !s_ledOn;
        _write(s_ledOn);
      }
      break;
  }
}

}  // namespace led
