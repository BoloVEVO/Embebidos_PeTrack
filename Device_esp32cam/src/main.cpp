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
#include "identity.h"

#define FW_VERSION "0.4.2-COLD-BOOT"

// En un encendido en frio, el regulador de muchas placas ESP32-CAM tarda en
// estabilizarse. Evita encender camara y radio durante ese transitorio.
static constexpr uint32_t POWER_STABILIZE_MS = 1200;

static netcfg::Config s_cfg;
static uint32_t s_lastHb = 0;
static uint32_t s_lastWifiCheck = 0;
static bool s_camOk = false;
static bool s_videoActive = false;
static uint32_t s_videoStarted = 0;
static uint32_t s_lastVideoFrame = 0;
static uint32_t s_lastVideoFrameOk = 0;
static ble::PetHit s_videoHit;

static void stopVideo(const char *reason)
{
  s_videoActive = false;
  cam::setStreaming(false);
  up::endVideo(s_cfg, reason);
}

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
  delay(POWER_STABILIZE_MS);

  led::begin();
  Serial.println();
  Serial.println("Device (ESP32-CAM) boot - P3/P4/P6");
  Serial.printf("  fw=%s\n", FW_VERSION);
  Serial.printf("  device_id=%s\n", identity::deviceId().c_str());

  s_cfg = netcfg::load();
  Serial.printf("  residencia=%s  backend=%s  wifi=%s\n",
                s_cfg.residence.c_str(),
                s_cfg.backendHost.c_str(),
                s_cfg.ssid.length() ? s_cfg.ssid.c_str() : "(sin configurar)");

  if (s_cfg.ssid.length() > 0)
    led::setConnecting();

  // Conectar primero el radio y solo despues encender la camara. Esto reduce
  // el pico simultaneo de consumo que puede causar brownout al conectar USB.
  up::ensureWifi(s_cfg);
  _syncLed();

  s_camOk = cam::begin();
  if (!s_camOk)
    Serial.println("  [warn] cámara no inicializó");

  ble::begin();
  Serial.println("  listo: esperando collares PETTRACK cercanos...");
}

void loop()
{
  led::update(); // primero: avanzar la máquina de estados del LED

  ble::PetHit hit;
  if (ble::take(hit))
  {
    bool startingVideo = !s_videoActive;
    s_videoHit = hit;
    if (!s_videoActive) { s_videoActive = true; s_videoStarted = millis(); s_lastVideoFrame = 0; s_lastVideoFrameOk = s_videoStarted; cam::setStreaming(true); }
    Serial.printf("[evt] mascota cerca collar_id=%s pet_id=%s rssi=%d -> captura+upload\n",
                  hit.collar_id[0] ? hit.collar_id : "legacy", hit.pet_id, hit.rssi);
    led::pulse(); // destello visual de detección
    // Cualquier main actúa como proxy de presencia, aunque el collar sea de otro residente.
    for (uint8_t i = 0; i < hit.count; ++i)
      up::collarHeartbeat(s_cfg, hit.nearby[i].collar_id, hit.nearby[i].rssi, hit.nearby[i].inclination_angle);

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
          int code = up::postDetection(s_cfg, hit, fb->buf, fb->len);
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
    // Los 20 s cuentan desde que terminó la captura inicial y empieza el video.
    if (startingVideo) {
      s_videoStarted = millis();
      s_lastVideoFrame = 0;
      s_lastVideoFrameOk = s_videoStarted;
    }
  }

  uint32_t now = millis();

  if (s_videoActive) {
    // Dar una ventana completa tras el upload inicial: durante ese POST el
    // scan estuvo pausado y lastNearbyMs todavia puede contener una muestra vieja.
    bool timedOut = now - s_videoStarted >= VIDEO_COLLAR_TIMEOUT_MS &&
                    now - ble::lastNearbyMs() >= VIDEO_COLLAR_TIMEOUT_MS;
    bool maxDuration = now - s_videoStarted >= VIDEO_MAX_DURATION_MS;
    bool uploadTimedOut = now - s_lastVideoFrameOk >= VIDEO_UPLOAD_TIMEOUT_MS;
    if (timedOut) {
      stopVideo("collar_timeout");
    } else if (maxDuration) {
      stopVideo("max_duration");
    } else if (uploadTimedOut) {
      stopVideo("frame_timeout");
    } else if (s_camOk && now - s_lastVideoFrame >= VIDEO_FRAME_MS) {
      s_lastVideoFrame = now;
      camera_fb_t *frame = cam::capture();
      if (frame) {
        int code = up::postVideoFrame(s_cfg, s_videoHit, frame->buf, frame->len);
        Serial.printf("[video] frame -> HTTP %d\n", code);
        if (code >= 200 && code < 300) s_lastVideoFrameOk = millis();
        cam::release(frame);
      }
    }
  }

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

  // Cede tiempo al RTOS y revisa la cadencia varias veces dentro de cada ventana de 100 ms.
  delay(10);
}
