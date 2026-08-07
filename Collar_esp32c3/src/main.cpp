#include <Arduino.h>
#include <NimBLEDevice.h>
#include <esp_mac.h>
#include "config.h"
#include "identity.h"
#include "mpu6050.h"
#include "pairing_service.h"

#define FW_VERSION "0.4.0-C3MINI-LP"

#if SERIAL_DIAGNOSTICS
#define LOG_BEGIN() Serial.begin(115200)
#define LOG_PRINTLN(...) Serial.println(__VA_ARGS__)
#define LOG_PRINTF(...) Serial.printf(__VA_ARGS__)
#else
#define LOG_BEGIN() ((void)0)
#define LOG_PRINTLN(...) ((void)0)
#define LOG_PRINTF(...) ((void)0)
#endif

static identity::Identity s_identity;
static bool s_sensorAvailable = false;
static float s_inclination = NAN;
static bool startAdvertising() {
  NimBLEAdvertising *adv = NimBLEDevice::getAdvertising();
  if (adv->isAdvertising()) adv->stop();

  NimBLEAdvertisementData advData;
  advData.setFlags(BLE_HS_ADV_F_DISC_GEN);
  std::string mfg;
  mfg += (char)(COMPANY_ID & 0xFF);
  mfg += (char)((COMPANY_ID >> 8) & 0xFF);
  mfg += (char)BLE_PROTOCOL_VERSION;
  uint8_t mac[6];
  esp_efuse_mac_get_default(mac);
  for (int i = 0; i < 6; ++i) mfg += (char)mac[i];
  int16_t rawAngle = INT16_MIN;
  if (isfinite(s_inclination)) {
    rawAngle = (int16_t)lroundf(constrain(s_inclination, 0.0f, 180.0f) * 100.0f);
  }
  mfg += (char)(rawAngle & 0xFF);
  mfg += (char)((rawAngle >> 8) & 0xFF);
  mfg += std::string(s_identity.petId.c_str());
  advData.setManufacturerData(mfg);
  adv->setAdvertisementData(advData);

  NimBLEAdvertisementData scanData;
  scanData.setName(DEVICE_NAME);
  scanData.setCompleteServices(NimBLEUUID(SERVICE_UUID));
  adv->setScanResponseData(scanData);
  adv->setMinInterval(BLE_ADV_MIN_INTERVAL);
  adv->setMaxInterval(BLE_ADV_MAX_INTERVAL);
  return adv->start();
}

void setup() {
#if LOW_POWER_MODE
  setCpuFrequencyMhz(80);
#endif
  LOG_BEGIN();
  LOG_PRINTF("PETRACK %s\n", FW_VERSION);

  s_identity = identity::load();
  LOG_PRINTF("Collar ID: %s pet_id=%s paired=%s main=%s\n",
             s_identity.collarId.c_str(), s_identity.petId.c_str(),
             s_identity.paired ? "yes" : "no",
             s_identity.mainDeviceId.isEmpty() ? "(none)" : s_identity.mainDeviceId.c_str());
  s_sensorAvailable = motion::begin();
  if (s_sensorAvailable && !motion::readInclination(s_inclination)) {
    s_inclination = NAN;
  }
  NimBLEDevice::init(DEVICE_NAME);
  // Potencia maxima para mantener un enlace fiable con la ESP32-CAM.
  NimBLEDevice::setPower(ESP_PWR_LVL_P9);
  pairing::begin();
  LOG_PRINTF("BLE advertising: %s\n", startAdvertising() ? "ok" : "error");

  LOG_PRINTF("MPU6050: %s angle=%.2f\n",
             s_sensorAvailable ? "ok" : "not detected", s_inclination);
}

void loop() {
  static uint32_t lastDiagnostic = 0;
  const uint32_t now = millis();

  static uint32_t lastInclinationSample = 0;
  if (s_sensorAvailable && now - lastInclinationSample >= INCLINATION_SAMPLE_MS &&
      !pairing::hasConnections()) {
    lastInclinationSample = now;
    float nextInclination;
    if (motion::readInclination(nextInclination)) {
      s_inclination = nextInclination;
      startAdvertising();
    }
  }

  if (pairing::restartDue()) {
    delay(50);
    ESP.restart();
  }
#if SERIAL_DIAGNOSTICS
  if (now - lastDiagnostic >= 5000) {
    lastDiagnostic = now;
    LOG_PRINTF("[ble] alive advertising=%s pet_id=%s\n",
               NimBLEDevice::getAdvertising()->isAdvertising() ? "yes" : "no",
               s_identity.petId.c_str());
  }
#endif
  delay(10);
}
