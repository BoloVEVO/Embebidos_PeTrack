// camera.h — Inicialización y captura de la cámara (esp_camera).
#ifndef DEVICE_CAMERA_H
#define DEVICE_CAMERA_H

#include "esp_camera.h"

namespace cam {
// Inicializa la cámara con los pines AI-Thinker (config.h). True si OK.
bool begin();
// Captura un frame JPEG. Devuelve el frame buffer (liberar con release()) o nullptr.
camera_fb_t *capture();
// Devuelve el frame buffer al driver (obligatorio tras capture()).
void release(camera_fb_t *fb);
void setStreaming(bool enabled);
}  // namespace cam

#endif  // DEVICE_CAMERA_H
