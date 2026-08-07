// =============================================================================
//  config.h — Collar (ESP32-C3 Mini/SuperMini) · detección por proximidad
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
#define MAX_PET_ID_LEN 12
#define BLE_PROTOCOL_VERSION 2
#define PAIRING_SERVICE_UUID "9d3a2f00-1c2b-4e6a-9f00-a1b2c3d4e5f7"
#define PAIRING_CHAR_UUID    "9d3a2f00-1c2b-4e6a-9f00-a1b2c3d4e5f8"

// Intervalo de tiempo que el dispostivo manda la señal por BLE
#define LOW_POWER_MODE 1
#define SERIAL_DIAGNOSTICS 1
#define BLE_ADV_MIN_INTERVAL 320
#define BLE_ADV_MAX_INTERVAL 480

// MPU6050 por I²C según el cableado físico del collar. GPIO8 queda dedicado
// a SDA y no se configura como LED. El advertising BLE funciona aunque el
// sensor no esté conectado (publica el marcador de ángulo no disponible).
#define MPU6050_SDA_PIN 8
#define MPU6050_SCL_PIN 9
#define MPU6050_ADDRESS 0x68
#define INCLINATION_SAMPLE_MS 10000
#define ADVERTISEMENT_UPDATE_MS 10000

#endif
