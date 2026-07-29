// uploader.h — WiFi + subida de detecciones al backend + heartbeat.
#ifndef DEVICE_UPLOADER_H
#define DEVICE_UPLOADER_H

#include <Arduino.h>
#include "net_config.h"
#include "ble_scanner.h"

namespace up {

// Conecta WiFi si no lo está (usa cfg). True si quedó conectado.
bool ensureWifi(const netcfg::Config &cfg);

// POST /detection (multipart: meta JSON + foto JPEG). Devuelve código HTTP (<0 = error).
int postDetection(const netcfg::Config &cfg, const ble::PetHit &hit,
                  const uint8_t *jpeg, size_t len);

// POST /device/heartbeat.
void heartbeat(const netcfg::Config &cfg);
void collarHeartbeat(const netcfg::Config &cfg, const char *collarId, int rssi, float inclinationAngle);
int postVideoFrame(const netcfg::Config &cfg, const ble::PetHit &hit, const uint8_t *jpeg, size_t len);
void endVideo(const netcfg::Config &cfg, const char *reason);

}  // namespace up

#endif  // DEVICE_UPLOADER_H
