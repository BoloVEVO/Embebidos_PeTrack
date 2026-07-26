#include <Arduino.h>
#include <NimBLEDevice.h>
#include <esp_mac.h>
#include "config.h"
#include "identity.h"
#include "pairing_service.h"

#define FW_VERSION "0.3.0-ID"

static identity::Identity s_identity;

static void startAdvertising()
{
  NimBLEAdvertising *adv = NimBLEDevice::getAdvertising();

  // Payload binario: company(2) + version(1) + MAC collar(6) + pet_id(<=12).
  NimBLEAdvertisementData advData;
  advData.setFlags(BLE_HS_ADV_F_DISC_GEN);
  advData.setName(DEVICE_NAME);
  std::string mfg;
  mfg += (char)(COMPANY_ID & 0xFF); // company id (little-endian)
  mfg += (char)((COMPANY_ID >> 8) & 0xFF);
  mfg += (char)BLE_PROTOCOL_VERSION;
  uint8_t mac[6];
  esp_efuse_mac_get_default(mac);
  for (int i = 0; i < 6; ++i) mfg += (char)mac[i];
  mfg += std::string(s_identity.petId.c_str());
  advData.setManufacturerData(mfg);
  adv->setAdvertisementData(advData);

  // Service UUID del microcontrolador para que sea descubierto ---
  NimBLEAdvertisementData scanData;
  scanData.setCompleteServices(NimBLEUUID(SERVICE_UUID));
  adv->setScanResponseData(scanData);

  // Intervalo
  adv->setMinInterval(0x1E0); // 300 ms
  adv->setMaxInterval(0x280); // 400 ms

  adv->start();
}

void setup()
{
  Serial.begin(115200);
  delay(300);
  Serial.println();
  Serial.println("Iniciando Collar PETRACK P2");
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
  startAdvertising();
  Serial.print("BLE iniciado (name=");
  Serial.print(DEVICE_NAME);
  Serial.println(")");
}

void loop()
{
  // El advertising es continuo (lo gestiona NimBLE). Latido de diagnóstico.
  Serial.printf("[hb] collar_id=%s pet_id=%s main_id=%s\n",
                s_identity.collarId.c_str(), s_identity.petId.c_str(),
                s_identity.paired ? s_identity.mainDeviceId.c_str() : "-");
  delay(HEARTBEAT_MS);
}
