// uploader.cpp — WiFi + POST multipart al backend (HTTPClient) + heartbeat.
#include "uploader.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include "config.h"

namespace up
{

  bool ensureWifi(const netcfg::Config &cfg)
  {
    if (WiFi.status() == WL_CONNECTED)
      return true;
    if (cfg.ssid.length() == 0)
    {
      Serial.println("[wifi] sin SSID configurado (NVS/config.h)");
      return false;
    }
    Serial.printf("[wifi] conectando a %s ...\n", cfg.ssid.c_str());
    WiFi.mode(WIFI_STA);
    WiFi.begin(cfg.ssid.c_str(), cfg.pass.c_str());
    uint32_t t0 = millis();
    while (WiFi.status() != WL_CONNECTED && (millis() - t0) < WIFI_TIMEOUT_MS)
    {
      delay(200);
    }
    bool ok = WiFi.status() == WL_CONNECTED;
    Serial.printf("[wifi] %s%s\n", ok ? "conectado, IP=" : "fallo",
                  ok ? WiFi.localIP().toString().c_str() : "");
    return ok;
  }

  int postDetection(const netcfg::Config &cfg, const char *petId, int rssi,
                    const uint8_t *jpeg, size_t len)
  {
    if (WiFi.status() != WL_CONNECTED)
      return -1;

    // meta JSON: el dispositivo envía su pet_id detectado, SU residencia y el RSSI.
    char meta[160];
    snprintf(meta, sizeof(meta),
             "{\"pet_id\":\"%s\",\"residence\":\"%s\",\"rssi\":%d}",
             petId, cfg.residence.c_str(), rssi);

    String boundary = "----petrack" + String(millis());
    String head = "--" + boundary +
                  "\r\nContent-Disposition: form-data; name=\"meta\"\r\n\r\n" + meta +
                  "\r\n--" + boundary +
                  "\r\nContent-Disposition: form-data; name=\"photo\"; "
                  "filename=\"d.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n";
    String tail = "\r\n--" + boundary + "--\r\n";

    size_t total = head.length() + len + tail.length();
    uint8_t *body = (uint8_t *)(psramFound() ? ps_malloc(total) : malloc(total));
    if (!body)
    {
      Serial.println("[up] sin memoria para el body multipart");
      return -2;
    }
    memcpy(body, head.c_str(), head.length());
    memcpy(body + head.length(), jpeg, len);
    memcpy(body + head.length() + len, tail.c_str(), tail.length());

    WiFiClient client;
    HTTPClient http;
    String url = cfg.backendHost + "/detection";
    http.begin(client, url);
    http.setTimeout(HTTP_TIMEOUT_MS);
    http.addHeader("Content-Type", "multipart/form-data; boundary=" + boundary);
    int code = http.POST(body, total);
    http.end();
    free(body);
    return code;
  }

  void heartbeat(const netcfg::Config &cfg)
  {
    if (WiFi.status() != WL_CONNECTED)
      return;
    WiFiClient client;
    HTTPClient http;
    String url = cfg.backendHost + "/device/heartbeat";
    http.begin(client, url);
    http.setTimeout(HTTP_TIMEOUT_MS);
    http.addHeader("Content-Type", "application/json");
    char body[160];
    snprintf(body, sizeof(body),
             "{\"device_id\":\"%s\",\"fw\":\"0.2.0\",\"residence\":\"%s\",\"wifi_rssi\":%d}",
             DEVICE_ID, cfg.residence.c_str(), (int)WiFi.RSSI());
    http.POST((uint8_t *)body, strlen(body));
    http.end();
  }

} // namespace up
