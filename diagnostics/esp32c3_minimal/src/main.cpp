#include <Arduino.h>

// En la ESP32-C3 SuperMini, el LED integrado suele estar conectado a GPIO8
// y es activo en nivel bajo.
constexpr uint8_t LED_PIN = 8;

void setup() {
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);
}

void loop() {
  digitalWrite(LED_PIN, LOW);
  delay(500);
  digitalWrite(LED_PIN, HIGH);
  delay(500);
}
