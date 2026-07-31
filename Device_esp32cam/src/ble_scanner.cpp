// ble_scanner.cpp — NimBLE scan + filtro Company ID + EMA RSSI + cooldown/pet.
#include "ble_scanner.h"
#include <NimBLEDevice.h>
#include <cstring>
#include "config.h"

namespace ble
{

  static portMUX_TYPE s_mux = portMUX_INITIALIZER_UNLOCKED;
  static volatile bool s_pending = false;
  static volatile uint32_t s_pendingSince = 0;
  static volatile uint32_t s_lastNearbyMs = 0;
  static uint32_t s_lastRawDiagnosticMs = 0;
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
      const uint32_t diagnosticNow = millis();
      if (diagnosticNow - s_lastRawDiagnosticMs >= 2000)
      {
        s_lastRawDiagnosticMs = diagnosticNow;
        Serial.printf("[ble-rx] addr=%s rssi=%d mfg_len=%u data=",
                      dev->getAddress().toString().c_str(), dev->getRSSI(),
                      (unsigned)md.size());
        for (size_t i = 0; i < md.size(); ++i)
          Serial.printf("%02X", (uint8_t)md[i]);
        Serial.println();
      }
      if (md.size() < 3)
        return;
      // Filtro por Company ID (little-endian) del proyecto.
      if ((uint8_t)md[0] != (COMPANY_ID & 0xFF) ||
          (uint8_t)md[1] != ((COMPANY_ID >> 8) & 0xFF))
        return;
      std::string pid;
      char collarId[20] = {0};
      float inclination = NAN;
      const uint8_t version = (uint8_t)md[2];
      // Solo aceptar versiones emitidas por collares PeTrack. COMPANY_ID=0xFFFF
      // es de pruebas y por si solo no identifica de forma segura al proyecto.
      if (version != 1 && version != BLE_PROTOCOL_VERSION)
        return;
      const size_t minimumSize = version >= 2 ? 12 : 10;
      if (md.size() >= minimumSize)
      {
        snprintf(collarId, sizeof(collarId), "col-%02X%02X%02X%02X%02X%02X",
                 (uint8_t)md[3], (uint8_t)md[4], (uint8_t)md[5],
                 (uint8_t)md[6], (uint8_t)md[7], (uint8_t)md[8]);
        size_t petOffset = 9;
        if (version >= 2 && md.size() >= 12) {
          int16_t rawAngle = (int16_t)((uint8_t)md[9] | ((uint16_t)(uint8_t)md[10] << 8));
          if (rawAngle != INT16_MIN) inclination = rawAngle / 100.0f;
          petOffset = 11;
        }
        pid = md.substr(petOffset);
      }
      else
        return;
      if (pid.empty() || pid.size() >= sizeof(s_hit.pet_id))
        return;

      char id[24];
      memcpy(id, pid.data(), pid.size());
      id[pid.size()] = 0;

      int rssi = dev->getRSSI();
      // El collar es la identidad fisica del beacon. Usar pet_id como clave
      // mezclaba el RSSI/cooldown de dos collares asignados a la misma mascota.
      Track *t = findTrack(collarId[0] ? collarId : id);
      t->ema = (t->ema <= -126.0f) ? (float)rssi
                                   : (RSSI_EMA_ALPHA * rssi + (1.0f - RSSI_EMA_ALPHA) * t->ema);

      uint32_t now = millis();
      const bool near = t->ema >= RSSI_THRESHOLD;
      if (near) s_lastNearbyMs = now;
      if (near)
      {
        portENTER_CRITICAL(&s_mux);
        const bool cooldownReady = t->lastHitMs == 0 ||
                                   (now - t->lastHitMs) >= COOLDOWN_MS;
        if (!s_pending && cooldownReady)
        { // inicia una ventana para reunir todos los collares cercanos
          t->lastHitMs = now;
          memset(&s_hit, 0, sizeof(s_hit));
          strncpy(s_hit.pet_id, id, sizeof(s_hit.pet_id));
          strncpy(s_hit.collar_id, collarId, sizeof(s_hit.collar_id) - 1);
          s_hit.collar_id[sizeof(s_hit.collar_id) - 1] = 0;
          s_hit.rssi = (int)t->ema;
          s_hit.inclination_angle = inclination;
          s_pendingSince = now;
          s_pending = true;
        }
        if (s_pending) {
          bool exists = false;
          for (uint8_t i = 0; i < s_hit.count; ++i) {
            if (strncmp(s_hit.nearby[i].collar_id, collarId,
                        sizeof(s_hit.nearby[i].collar_id)) == 0) {
              // Mantener la muestra mas reciente durante la ventana de grupo.
              s_hit.nearby[i].rssi = (int)t->ema;
              s_hit.nearby[i].inclination_angle = inclination;
              exists = true;
              break;
            }
          }
          if (!exists && s_hit.count < MAX_TRACKED_PETS && collarId[0]) {
            PetHit::NearbyPet &nearby = s_hit.nearby[s_hit.count++];
            strncpy(nearby.collar_id, collarId, sizeof(nearby.collar_id) - 1);
            nearby.collar_id[sizeof(nearby.collar_id) - 1] = 0;
            strncpy(nearby.pet_id, id, sizeof(nearby.pet_id) - 1);
            nearby.pet_id[sizeof(nearby.pet_id) - 1] = 0;
            nearby.rssi = (int)t->ema;
            nearby.inclination_angle = inclination;
          }
        }
        portEXIT_CRITICAL(&s_mux);
        if (cooldownReady)
          Serial.printf("[ble] HIT collar_id=%s pet_id=%s rssi=%d ema=%.0f\n",
                        collarId, id, rssi, t->ema);
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
    if (s_pending && millis() - s_pendingSince >= DETECTION_GROUP_MS)
    {
      out = s_hit;
      s_pending = false;
      got = true;
    }
    portEXIT_CRITICAL(&s_mux);
    return got;
  }

  uint32_t lastNearbyMs() { return s_lastNearbyMs; }

  bool pairCollar(const char *collarId, const char *petId, const char *mainDeviceId)
  {
    if (!s_scan || !collarId || !petId || !mainDeviceId) return false;
    s_scan->clearResults();
    NimBLEScanResults results = s_scan->start(8, false);
    NimBLEAdvertisedDevice *target = nullptr;
    for (int i = 0; i < results.getCount(); ++i)
    {
      NimBLEAdvertisedDevice device = results.getDevice(i);
      if (!device.haveManufacturerData()) continue;
      std::string md = device.getManufacturerData();
      if (md.size() < 12 ||
          (uint8_t)md[0] != (COMPANY_ID & 0xFF) ||
          (uint8_t)md[1] != ((COMPANY_ID >> 8) & 0xFF) ||
          (uint8_t)md[2] != BLE_PROTOCOL_VERSION) continue;
      char found[20];
      snprintf(found, sizeof(found), "col-%02X%02X%02X%02X%02X%02X",
               (uint8_t)md[3], (uint8_t)md[4], (uint8_t)md[5],
               (uint8_t)md[6], (uint8_t)md[7], (uint8_t)md[8]);
      if (strcasecmp(found, collarId) == 0)
      {
        target = new NimBLEAdvertisedDevice(device);
        break;
      }
    }
    if (!target) { s_scan->clearResults(); return false; }
    NimBLEClient *client = NimBLEDevice::createClient();
    bool ok = client->connect(target);
    if (ok)
    {
      NimBLERemoteService *service = client->getService(PAIRING_SERVICE_UUID);
      NimBLERemoteCharacteristic *characteristic = service ? service->getCharacteristic(PAIRING_CHAR_UUID) : nullptr;
      String payload = String(mainDeviceId) + "|" + petId;
      ok = characteristic && characteristic->writeValue(payload.c_str(), true);
      if (ok) {
        // El callback del collar sustituye "ready" por el resultado de la
        // operacion. No confundir una escritura ATT exitosa con emparejamiento.
        delay(100);
        std::string response = characteristic->readValue();
        ok = response == "ok";
        if (!ok)
          Serial.printf("[ble] pairing rechazado: %s\n", response.c_str());
      }
    }
    if (client->isConnected()) client->disconnect();
    NimBLEDevice::deleteClient(client);
    delete target;
    s_scan->clearResults();
    return ok;
  }

} // namespace ble
