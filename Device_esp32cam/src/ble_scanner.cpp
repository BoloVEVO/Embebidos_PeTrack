// ble_scanner.cpp — NimBLE scan + filtro Company ID + EMA RSSI + cooldown/pet.
#include "ble_scanner.h"
#include <NimBLEDevice.h>
#include <cstring>
#include "config.h"

namespace ble
{

  static portMUX_TYPE s_mux = portMUX_INITIALIZER_UNLOCKED;
  static volatile bool s_pending = false;
  static PetHit s_hit;

  // Seguimiento por mascota: EMA del RSSI + última vez que disparó (cooldown).
  struct Track
  {
    char id[24];
    float ema;
    uint32_t lastHitMs;
    bool used;
  };
  static Track s_tracks[MAX_TRACKED_PETS];

  static Track *findTrack(const char *id)
  {
    int freeIdx = -1;
    for (int i = 0; i < MAX_TRACKED_PETS; i++)
    {
      if (s_tracks[i].used && strncmp(s_tracks[i].id, id, sizeof(s_tracks[i].id)) == 0)
        return &s_tracks[i];
      if (!s_tracks[i].used && freeIdx < 0)
        freeIdx = i;
    }
    if (freeIdx < 0)
      freeIdx = 0; // sin espacio: recicla el primero
    Track *t = &s_tracks[freeIdx];
    t->used = true;
    strncpy(t->id, id, sizeof(t->id) - 1);
    t->id[sizeof(t->id) - 1] = 0;
    t->ema = -127.0f;
    t->lastHitMs = 0;
    return t;
  }

  class ScanCB : public NimBLEAdvertisedDeviceCallbacks
  {
    void onResult(NimBLEAdvertisedDevice *dev) override
    {
      if (!dev->haveManufacturerData())
        return;
      std::string md = dev->getManufacturerData();
      if (md.size() < 3)
        return;
      // Filtro por Company ID (little-endian) del proyecto.
      if ((uint8_t)md[0] != (COMPANY_ID & 0xFF) ||
          (uint8_t)md[1] != ((COMPANY_ID >> 8) & 0xFF))
        return;
      std::string pid = md.substr(2);
      if (pid.empty() || pid.size() >= sizeof(s_hit.pet_id))
        return;

      char id[24];
      memcpy(id, pid.data(), pid.size());
      id[pid.size()] = 0;

      int rssi = dev->getRSSI();
      Track *t = findTrack(id);
      t->ema = (t->ema <= -126.0f) ? (float)rssi
                                   : (RSSI_EMA_ALPHA * rssi + (1.0f - RSSI_EMA_ALPHA) * t->ema);

      uint32_t now = millis();
      const bool near = t->ema >= RSSI_THRESHOLD;
      if (near && (now - t->lastHitMs) >= COOLDOWN_MS)
      {
        t->lastHitMs = now;
        portENTER_CRITICAL(&s_mux);
        if (!s_pending)
        { // no pisar una detección aún sin procesar
          strncpy(s_hit.pet_id, id, sizeof(s_hit.pet_id));
          s_hit.rssi = (int)t->ema;
          s_pending = true;
        }
        portEXIT_CRITICAL(&s_mux);
        Serial.printf("[ble] HIT pet_id=%s rssi=%d ema=%.0f\n", id, rssi, t->ema);
      }
    }
  };

  static NimBLEScan *s_scan = nullptr;

  void begin()
  {
    NimBLEDevice::init("petrack-device");
    NimBLEDevice::setPower(ESP_PWR_LVL_P9);
    s_scan = NimBLEDevice::getScan();
    s_scan->setAdvertisedDeviceCallbacks(new ScanCB(), true); // wantDuplicates
    s_scan->setActiveScan(true);                              // recibe scan-response
    s_scan->setInterval(160);                                 // 100 ms
    s_scan->setWindow(160);
    s_scan->start(0, nullptr, false); // continuo
    Serial.println("[ble] scan iniciado (continuo)");
  }

  void pauseScan()
  {
    if (s_scan)
      s_scan->stop();
  }

  void resume()
  {
    if (s_scan)
    {
      s_scan->clearResults(); // libera memoria de resultados previos
      s_scan->start(0, nullptr, false);
    }
  }

  bool take(PetHit &out)
  {
    bool got = false;
    portENTER_CRITICAL(&s_mux);
    if (s_pending)
    {
      out = s_hit;
      s_pending = false;
      got = true;
    }
    portEXIT_CRITICAL(&s_mux);
    return got;
  }

} // namespace ble
