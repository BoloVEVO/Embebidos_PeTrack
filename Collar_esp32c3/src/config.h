// =============================================================================
//  config.h — Collar (ESP32-C3) · Sistema de detección de mascotas por proximidad
// -----------------------------------------------------------------------------
//  El collar es un BEACON BLE: anuncia su identidad (pet_id) para que el
//  dispositivo de la residencia lo detecte por proximidad (RSSI).
//
//  Reparto del advertising (límite legacy de 31 bytes):
//    - Advertisement:  flags + nombre (DEVICE_NAME) + manufacturer data
//                      (COMPANY_ID 2B + pet_id).
//    - Scan response:  Service UUID 128-bit del proyecto (para descubrimiento).
//  El dispositivo filtra por COMPANY_ID + DEVICE_NAME (y opcionalmente UUID).
//  Los datos de la mascota/dueño/residencia NO viajan por BLE: se resuelven en
//  el backend desde el registro `pets` (pet_id → datos).
// =============================================================================
#ifndef COLLAR_CONFIG_H
#define COLLAR_CONFIG_H

// UUID de servicio del PROYECTO (igual en docs/ARQUITECTURA.md y en el dispositivo).
#define SERVICE_UUID "9d3a2f00-1c2b-4e6a-9f00-a1b2c3d4e5f6"

// Nombre BLE y Company ID (0xFFFF = ID reservado para pruebas/uso interno).
#define DEVICE_NAME "PET"
#define COMPANY_ID 0xFFFF

// pet_id por defecto (se puede sobreescribir en NVS sin reflashear).
// Mantener corto (<= 16 chars) para no exceder el advertising.
#define DEFAULT_PET_ID "dog001"

// Intervalo de tiempo que el dispostivo manda la señal por BLE
#define HEARTBEAT_MS 5000

#endif
