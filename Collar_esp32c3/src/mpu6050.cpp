#include "mpu6050.h"
#include <Arduino.h>
#include <Wire.h>
#include <math.h>
#include "config.h"

namespace motion {
static bool writeRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MPU6050_ADDRESS);
  Wire.write(reg); Wire.write(value);
  return Wire.endTransmission() == 0;
}

bool begin() {
  Wire.begin(MPU6050_SDA_PIN, MPU6050_SCL_PIN);
  Wire.setTimeOut(50);
  Wire.setClock(400000);
  delay(50);
  return writeRegister(0x6B, 0x00) && // salir de sleep
         writeRegister(0x1C, 0x00);   // acelerómetro ±2 g
}

bool readInclination(float &degrees) {
  Wire.beginTransmission(MPU6050_ADDRESS);
  Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0 || Wire.requestFrom(MPU6050_ADDRESS, 6) != 6) return false;
  int16_t ax = (Wire.read() << 8) | Wire.read();
  int16_t ay = (Wire.read() << 8) | Wire.read();
  int16_t az = (Wire.read() << 8) | Wire.read();
  const float horizontal = sqrtf((float)ax * ax + (float)ay * ay);
  degrees = atan2f(horizontal, (float)az) * 180.0f / PI;
  return isfinite(degrees);
}
}
