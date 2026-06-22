// ble_scanner.h — Escaneo BLE de collares PETTRACK por proximidad (RSSI).
#ifndef DEVICE_BLE_SCANNER_H
#define DEVICE_BLE_SCANNER_H

#include <Arduino.h>

namespace ble
{

  // Una detección "cerca" lista para procesar (capturar + subir).
  struct PetHit
  {
    char pet_id[24];
    int rssi;
  };

  void begin();           // init NimBLE + arranca el scan continuo
  void pauseScan();       // detiene el scan (liberar radio durante el upload)
  void resume();          // reanuda el scan
  bool take(PetHit &out); // consume una detección pendiente (true si había)

} // namespace ble

#endif // DEVICE_BLE_SCANNER_H
