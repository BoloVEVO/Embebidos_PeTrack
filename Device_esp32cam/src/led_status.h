// led_status.h — Indicador LED del estado de conexión (AI-Thinker GPIO 33).
// GPIO 33 = LED onboard rojo, lógica activa en LOW.
#pragma once
#include <Arduino.h>

#define LED_STATUS_PIN 33

namespace led {
  void begin();
  void setConnecting();    // parpadeo rápido (200 ms) — conectando WiFi
  void setConnected();     // luz sólida — listo y conectado
  void setDisconnected();  // apagado — sin red / sin SSID configurado
  void pulse();            // destello breve al detectar mascota (no bloqueante)
  void update();           // llamar en cada loop()
}
