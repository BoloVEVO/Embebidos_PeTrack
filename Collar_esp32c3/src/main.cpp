#include <Arduino.h>
#include <NimBLEDevice.h>
#include <esp_mac.h>
#include "config.h"
#include "identity.h"
#include "pairing_service.h"
#include "mpu6050.h"

#define FW_VERSION "0.3.1-C3MINI"

static identity::Identity s_identity;

static bool s_mpuOk = false;
static float s_inclination = NAN;

static bool startAdvertising()
{
  NimBLEAdvertising *adv = NimBLEDevice::getAdvertising();
  if (adv->isAdvertising()) adv->stop();

  // Payload binario: company(2) + version(1) + MAC collar(6) + pet_id(<=12).
  NimBLEAdvertisementData advData;
  advData.setFlags(BLE_HS_ADV_F_DISC_GEN);
  std::string mfg;
  mfg += (char)(COMPANY_ID & 0xFF); // company id (little-endian)
  mfg += (char)((COMPANY_ID >> 8) & 0xFF);
  mfg += (char)BLE_PROTOCOL_VERSION;
  uint8_t mac[6];
  esp_efuse_mac_get_default(mac);
  for (int i = 0; i < 6; ++i) mfg += (char)mac[i];
  int16_t angle = isfinite(s_inclination) ? (int16_t)roundf(s_inclination * 100.0f) : INT16_MIN;
  mfg += (char)(angle & 0xFF);
  mfg += (char)((angle >> 8) & 0xFF);
  mfg += std::string(s_identity.petId.c_str());
  advData.setManufacturerData(mfg);
  adv->setAdvertisementData(advData);

  // Service UUID del microcontrolador para que sea descubierto ---
  NimBLEAdvertisementData scanData;
  scanData.setName(DEVICE_NAME);
  scanData.setCompleteServices(NimBLEUUID(SERVICE_UUID));
  adv->setScanResponseData(scanData);

  // Intervalo
  adv->setMinInterval(0x1E0); // 300 ms
  adv->setMaxInterval(0x280); // 400 ms

  return adv->start();
}

void setup()
{
  Serial.begin(115200);
  delay(300);
  Serial.println();
  Serial.println("Iniciando Collar PETRACK (ESP32-C3 Mini)");
  Serial.print("  fw = ");
  Serial.println(FW_VERSION);

  s_identity = identity::load();
  Serial.printf("  collar_id=%s pet_id=%s paired=%s main_id=%s\n",
                s_identity.collarId.c_str(), s_identity.petId.c_str(),
                s_identity.paired ? "si" : "no",
                s_identity.paired ? s_identity.mainDeviceId.c_str() : "(sin asignar)");

  NimBLEDevice::init(DEVICE_NAME);
  NimBLEDevice::setPower(ESP_PWR_LVL_P9); // alcance máximo
  pairing::begin();
  const bool bleStarted = startAdvertising();
  Serial.printf("BLE advertising: %s (name=%s)\n",
                bleStarted ? "iniciado" : "ERROR", DEVICE_NAME);

  // BLE debe funcionar independientemente del sensor. Inicializar I2C solo
  // despues de que el collar ya este anunciandose.
  s_mpuOk = motion::begin();
  if (s_mpuOk) motion::readInclination(s_inclination);
  Serial.printf("MPU6050: %s\n", s_mpuOk ? "detectado" : "no disponible");
}

void loop()
{
  static uint32_t lastSample = 0;
  static uint32_t lastAdvertisementUpdate = 0;
  static uint32_t lastHeartbeat = 0;
  uint32_t now = millis();
  if (pairing::restartDue()) {
    Serial.println("[ble] emparejamiento guardado; reiniciando");
    delay(50);
    ESP.restart();
  }
  if (s_mpuOk && now - lastSample >= INCLINATION_SAMPLE_MS) {
    lastSample = now;
    float value;
    if (motion::readInclination(value)) s_inclination = value;
  }
  // Actualizar la telemetria sin cortar el advertising cada segundo.
  if (s_mpuOk && now - lastAdvertisementUpdate >= ADVERTISEMENT_UPDATE_MS) {
    lastAdvertisementUpdate = now;
    if (!startAdvertising()) Serial.println("[ble] ERROR al actualizar advertising");
  }
  if (now - lastHeartbeat >= HEARTBEAT_MS) {
    lastHeartbeat = now;
    Serial.printf("[hb] collar_id=%s pet_id=%s main_id=%s inclinacion=%.2f\n",
                  s_identity.collarId.c_str(), s_identity.petId.c_str(),
                  s_identity.paired ? s_identity.mainDeviceId.c_str() : "-", s_inclination);
  }
  delay(1);
}
