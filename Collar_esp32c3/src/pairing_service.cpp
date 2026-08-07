#include "pairing_service.h"
#include <Arduino.h>
#include <NimBLEDevice.h>
#include "config.h"
#include "identity.h"

namespace pairing {
static volatile uint32_t s_restartRequestedAt = 0;
static NimBLEServer *s_server = nullptr;

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
    // Reiniciar desde loop(), despues de que NimBLE envie la respuesta ATT y
    // permita que el cliente lea el resultado de la caracteristica.
    s_restartRequestedAt = millis();
  }
};

void begin() {
  s_server = NimBLEDevice::createServer();
  NimBLEService *service = s_server->createService(PAIRING_SERVICE_UUID);
  NimBLECharacteristic *config = service->createCharacteristic(
      PAIRING_CHAR_UUID, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::WRITE);
  config->setValue("ready");
  config->setCallbacks(new ConfigCallbacks());
  service->start();
}

bool restartDue() {
  const uint32_t requestedAt = s_restartRequestedAt;
  return requestedAt != 0 && millis() - requestedAt >= 1000;
}

bool hasConnections() {
  return s_server && s_server->getConnectedCount() > 0;
}
}
