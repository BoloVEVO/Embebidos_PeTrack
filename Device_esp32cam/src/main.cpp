// =============================================================================
//  Dispositivo residencia (ESP32-CAM) — P3 scan + P4 cámara + P6 upload WiFi
// -----------------------------------------------------------------------------
//  Flujo: scan BLE → detecta collar PETTRACK cerca (RSSI + cooldown) →
//  pausa scan → captura JPEG → POST /detection por WiFi → reanuda scan.
//  LED GPIO 33: parpadeante = conectando WiFi; sólido = listo; apagado = sin red.
// =============================================================================
#include <Arduino.h>
#include <WiFi.h>

#include "config.h"
#include "net_config.h"
#include "camera.h"
#include "ble_scanner.h"
#include "uploader.h"
#include "led_status.h"

#define FW_VERSION "0.3.0-P6"

static netcfg::Config s_cfg;
static uint32_t s_lastHb = 0;
static uint32_t s_lastWifiCheck = 0;
static bool s_camOk = false;

// Actualiza el LED según el estado real del WiFi.
static void _syncLed()
{
  if (WiFi.status() == WL_CONNECTED)
  {
    led::setConnected();
  }
  else if (s_cfg.ssid.length() == 0)
  {
    led::setDisconnected();
  }
  else
  {
    led::setConnecting();
  }
}

void setup()
{
  Serial.begin(115200);
  delay(300);

  led::begin();
  Serial.println();
  Serial.println("Device (ESP32-CAM) boot - P3/P4/P6");
  Serial.printf("  fw=%s\n", FW_VERSION);

  s_cfg = netcfg::load();
  Serial.printf("  residencia=%s  backend=%s  wifi=%s\n",
                s_cfg.residence.c_str(),
                s_cfg.backendHost.c_str(),
                s_cfg.ssid.length() ? s_cfg.ssid.c_str() : "(sin configurar)");

  if (s_cfg.ssid.length() > 0)
    led::setConnecting();

  s_camOk = cam::begin();
  if (!s_camOk)
    Serial.println("  [warn] cámara no inicializó");

  up::ensureWifi(s_cfg);
  _syncLed();

  ble::begin();
  Serial.println("  listo: esperando collares PETTRACK cercanos...");
}

void loop()
{
  led::update(); // primero: avanzar la máquina de estados del LED

  ble::PetHit hit;
  if (ble::take(hit))
  {
    Serial.printf("[evt] mascota cerca pet_id=%s rssi=%d -> captura+upload\n",
                  hit.pet_id, hit.rssi);
    led::pulse(); // destello visual de detección

    ble::pauseScan();

    if (s_camOk)
    {
      camera_fb_t *fb = cam::capture();
      if (fb)
      {
        bool wifiOk = up::ensureWifi(s_cfg);
        _syncLed();
        if (wifiOk)
        {
          int code = up::postDetection(s_cfg, hit.pet_id, hit.rssi, fb->buf, fb->len);
          Serial.printf("[evt] POST /detection (%u bytes) -> %d\n",
                        (unsigned)fb->len, code);
        }
        else
        {
          Serial.println("[evt] sin WiFi: detección NO subida");
        }
        cam::release(fb);
      }
    }
    else
    {
      Serial.println("[evt] cámara no disponible");
    }

    ble::resume();
  }

  uint32_t now = millis();

  // Reconexión WiFi periódica si se cae la red
  if (now - s_lastWifiCheck >= 10000)
  {
    s_lastWifiCheck = now;
    if (WiFi.status() != WL_CONNECTED && s_cfg.ssid.length() > 0)
    {
      led::setConnecting();
      up::ensureWifi(s_cfg);
    }
    _syncLed();
  }

  if (now - s_lastHb >= HEARTBEAT_MS)
  {
    s_lastHb = now;
    up::heartbeat(s_cfg);
  }

  delay(50);
}
