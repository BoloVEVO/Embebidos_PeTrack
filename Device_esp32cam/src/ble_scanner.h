// ble_scanner.h — Escaneo BLE de collares PETTRACK por proximidad (RSSI).
#ifndef DEVICE_BLE_SCANNER_H
#define DEVICE_BLE_SCANNER_H

#include <Arduino.h>
#include "config.h"

namespace ble
{

  // Una detección "cerca" lista para procesar (capturar + subir).
  struct PetHit
  {
    char collar_id[20];
    char pet_id[24];
    int rssi;
    struct NearbyPet { char collar_id[20]; char pet_id[24]; int rssi; };
    NearbyPet nearby[MAX_TRACKED_PETS];
    uint8_t count;
  };

  void begin();           // init NimBLE + arranca el scan continuo
  void pauseScan();       // detiene el scan (liberar radio durante el upload)
  void resume();          // reanuda el scan
  bool take(PetHit &out); // consume una detección pendiente (true si había)
  uint32_t lastNearbyMs();
  bool pairCollar(const char *collarId, const char *petId, const char *mainDeviceId);

} // namespace ble

#endif // DEVICE_BLE_SCANNER_H
