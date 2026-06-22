// uploader.h — WiFi + subida de detecciones al backend + heartbeat.
#ifndef DEVICE_UPLOADER_H
#define DEVICE_UPLOADER_H

#include <Arduino.h>
#include "net_config.h"

namespace up {

// Conecta WiFi si no lo está (usa cfg). True si quedó conectado.
bool ensureWifi(const netcfg::Config &cfg);

// POST /detection (multipart: meta JSON + foto JPEG). Devuelve código HTTP (<0 = error).
int postDetection(const netcfg::Config &cfg, const char *petId, int rssi,
                  const uint8_t *jpeg, size_t len);

// POST /device/heartbeat.
void heartbeat(const netcfg::Config &cfg);

}  // namespace up

#endif  // DEVICE_UPLOADER_H
