#include "pairing_service.h"
#include <Arduino.h>
#include <NimBLEDevice.h>
#include "config.h"
#include "identity.h"

namespace pairing {
class ConfigCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *characteristic) override {
    std::string raw = characteristic->getValue();
    String value(raw.c_str());
    int separator = value.indexOf('|');
    if (separator < 1) { characteristic->setValue("invalid"); return; }
    String mainId = value.substring(0, separator);
    String petId = value.substring(separator + 1);
    identity::Identity current = identity::load();
    if (current.paired && current.mainDeviceId != mainId) {
      characteristic->setValue("already_paired");
      return;
    }
    if (!identity::assignMain(mainId) || !identity::setPetId(petId)) {
      characteristic->setValue("invalid");
      return;
    }
    characteristic->setValue("ok");
    delay(250);
    ESP.restart();
  }
};

void begin() {
  NimBLEServer *server = NimBLEDevice::createServer();
  NimBLEService *service = server->createService(PAIRING_SERVICE_UUID);
  NimBLECharacteristic *config = service->createCharacteristic(
      PAIRING_CHAR_UUID, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::WRITE);
  config->setValue("ready");
  config->setCallbacks(new ConfigCallbacks());
  service->start();
}
}
