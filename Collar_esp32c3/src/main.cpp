#include <Arduino.h>
#include <NimBLEDevice.h>
#include <Preferences.h>

#include "config.h"

#define FW_VERSION "0.2.0-P2"

static Preferences prefs;
static String petId;

static void startAdvertising()
{
  NimBLEAdvertising *adv = NimBLEDevice::getAdvertising();

  // INFO: (company id LE + pet_id
  NimBLEAdvertisementData advData;
  advData.setFlags(BLE_HS_ADV_F_DISC_GEN);
  advData.setName(DEVICE_NAME);
  std::string mfg;
  mfg += (char)(COMPANY_ID & 0xFF); // company id (little-endian)
  mfg += (char)((COMPANY_ID >> 8) & 0xFF);
  mfg += std::string(petId.c_str()); // payload: pet_id
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

  // pet_id desde NVS (editable sin reflashear), con fallback al default.
  prefs.begin("petrack", false);
  petId = prefs.getString("pet_id", DEFAULT_PET_ID);
  Serial.print("  pet_id = ");
  Serial.println(petId);

  NimBLEDevice::init(DEVICE_NAME);
  NimBLEDevice::setPower(ESP_PWR_LVL_P9); // alcance máximo
  startAdvertising();
  Serial.print("BLE iniciado (name=");
  Serial.print(DEVICE_NAME);
  Serial.println(")");
}

void loop()
{
  // El advertising es continuo (lo gestiona NimBLE). Latido de diagnóstico.
  Serial.print("[hb] PETRACK pet_id=");
  Serial.println(petId);
  delay(HEARTBEAT_MS);
}
