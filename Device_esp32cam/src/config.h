// =============================================================================
//  config.h — Dispositivo residencia (ESP32-CAM) · detección de mascotas
// -----------------------------------------------------------------------------
//  Constantes del proyecto: filtro BLE, proximidad, tiempos, cámara y defaults
//  de red. La config de red (WiFi + backend + residencia) se carga de NVS
//  (ver net_config.*) con fallback a estos defaults.
// =============================================================================
#ifndef DEVICE_CONFIG_H
#define DEVICE_CONFIG_H

// ----- Identidad BLE del collar (debe coincidir con Collar_esp32c3) -----------
#define SERVICE_UUID "9d3a2f00-1c2b-4e6a-9f00-a1b2c3d4e5f6"
#define TARGET_NAME "PETTRACK"
#define COMPANY_ID 0xFFFF
#define BLE_PROTOCOL_VERSION 1
#define PAIRING_SERVICE_UUID "9d3a2f00-1c2b-4e6a-9f00-a1b2c3d4e5f7"
#define PAIRING_CHAR_UUID "9d3a2f00-1c2b-4e6a-9f00-a1b2c3d4e5f8"

// ----- Proximidad -------------------------------------------------------------
#define RSSI_THRESHOLD -75  // dBm: RSSI (suavizado) >= umbral = "cerca"
#define RSSI_EMA_ALPHA 0.5f // suavizado EMA del RSSI (0..1; mayor = más reactivo)
#define COOLDOWN_MS 20000   // por pet_id: no re-disparar captura/upload tan seguido
#define MAX_TRACKED_PETS 12 // mascotas distintas que se rastrean a la vez
#define DETECTION_GROUP_MS 1500
#define VIDEO_FRAME_MS 1000
#define VIDEO_COLLAR_TIMEOUT_MS 10000
#define VIDEO_MAX_DURATION_MS 20000

// ----- Tiempos ----------------------------------------------------------------
#define HEARTBEAT_MS 15000        // POST /device/heartbeat
#define COLLAR_HEARTBEAT_MS 30000 // máximo una vez cada 30 s por collar
#define WIFI_TIMEOUT_MS 12000     // espera al conectar WiFi
#define HTTP_TIMEOUT_MS 10000     // timeout de POST /detection

// ----- Defaults de red (overridable por NVS / portal en versión final) --------
#define DEFAULT_WIFI_SSID "CLARO-HOLGUIN" // inyectado por panel al flashear
#define DEFAULT_WIFI_PASS "holguin6904"
#define DEFAULT_BACKEND_HOST "http://192.168.100.13:3000" // inyectado por panel al flashear
#define DEFAULT_RESIDENCE "A-12"                          // residencia de ESTE dispositivo
#define VID_FRAMERATE 24

// ----- Cámara: framesize moderado para convivir con BLE+WiFi en PSRAM ----------
#define CAM_FRAMESIZE FRAMESIZE_XGA // 1024x768
#define CAM_JPEG_QUALITY 20         // 0-63 (menor = mejor calidad)

// ----- Pines cámara AI-Thinker ESP32-CAM --------------------------------------
#define PWDN_GPIO_NUM 32
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM 0
#define SIOD_GPIO_NUM 26
#define SIOC_GPIO_NUM 27
#define Y9_GPIO_NUM 35
#define Y8_GPIO_NUM 34
#define Y7_GPIO_NUM 39
#define Y6_GPIO_NUM 36
#define Y5_GPIO_NUM 21
#define Y4_GPIO_NUM 19
#define Y3_GPIO_NUM 18
#define Y2_GPIO_NUM 5
#define VSYNC_GPIO_NUM 25
#define HREF_GPIO_NUM 23
#define PCLK_GPIO_NUM 22

#endif // DEVICE_CONFIG_H
