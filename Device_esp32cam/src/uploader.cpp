// uploader.cpp — WiFi + POST multipart al backend (HTTPClient) + heartbeat.
#include "uploader.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <HTTPUpdate.h>
#include <ArduinoJson.h>
#include "config.h"
#include "identity.h"
#include "ble_scanner.h"

namespace up
{
  struct CollarHeartbeatSlot { String collarId; uint32_t lastSentMs; };
  static CollarHeartbeatSlot s_collarHeartbeats[MAX_TRACKED_PETS];

  static void ackCommand(const netcfg::Config &cfg, const char *commandId,
                         bool ok, const char *detail)
  {
    WiFiClient client;
    HTTPClient http;
    http.begin(client, cfg.backendHost + "/device/commands/" + commandId + "/ack");
    http.addHeader("Content-Type", "application/json");
    char body[240];
    snprintf(body, sizeof(body),
             "{\"device_id\":\"%s\",\"status\":\"%s\",\"detail\":\"%s\"}",
             identity::deviceId().c_str(), ok ? "completed" : "failed", detail);
    http.POST((uint8_t *)body, strlen(body));
    http.end();
  }

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

  int postDetection(const netcfg::Config &cfg, const ble::PetHit &hit,
                    const uint8_t *jpeg, size_t len)
  {
    if (WiFi.status() != WL_CONNECTED)
      return -1;

    // meta JSON: el dispositivo envía su pet_id detectado, SU residencia y el RSSI.
    DynamicJsonDocument metaDoc(1536);
    metaDoc["device_id"] = identity::deviceId();
    metaDoc["collar_id"] = hit.collar_id;
    metaDoc["pet_id"] = hit.pet_id;
    metaDoc["residence"] = cfg.residence;
    metaDoc["rssi"] = hit.rssi;
    JsonArray nearby = metaDoc.createNestedArray("nearby_collars");
    for (uint8_t i = 0; i < hit.count; ++i) {
      JsonObject item = nearby.createNestedObject();
      item["collar_id"] = hit.nearby[i].collar_id;
      item["pet_id"] = hit.nearby[i].pet_id;
      item["rssi"] = hit.nearby[i].rssi;
    }
    String meta;
    serializeJson(metaDoc, meta);

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
    char body[200];
    snprintf(body, sizeof(body),
             "{\"device_id\":\"%s\",\"type\":\"main\",\"fw\":\"0.4.0-VIDEO\"," 
             "\"residence\":\"%s\",\"wifi_rssi\":%d}",
             identity::deviceId().c_str(), cfg.residence.c_str(), (int)WiFi.RSSI());
    int code = http.POST((uint8_t *)body, strlen(body));
    String response = code == 200 ? http.getString() : "";
    http.end();
    if (response.isEmpty()) return;

    DynamicJsonDocument doc(3072);
    if (deserializeJson(doc, response)) return;
    for (JsonObject command : doc["commands"].as<JsonArray>())
    {
      const char *id = command["id"] | "";
      const char *type = command["type"] | "";
      if (strcmp(type, "pair_collar") == 0)
      {
        ble::pauseScan();
        bool ok = ble::pairCollar(command["collar_id"] | "", command["pet_id"] | "",
                                  identity::deviceId().c_str());
        ble::resume();
        ackCommand(cfg, id, ok, ok ? "paired" : "collar_not_found_or_rejected");
      }
      else if (strcmp(type, "ota") == 0)
      {
        String url = cfg.backendHost + "/device/firmware/" + (const char *)(command["token"] | "")
                     + "?device_id=" + identity::deviceId();
        ackCommand(cfg, id, true, "ota_started");
        ble::pauseScan();
        WiFiClient otaClient;
        httpUpdate.update(otaClient, url);
        ble::resume();
      }
    }
  }

  void collarHeartbeat(const netcfg::Config &cfg, const char *collarId, int rssi)
  {
    if (!collarId || !collarId[0] || WiFi.status() != WL_CONNECTED) return;
    uint32_t now = millis();
    int slot = -1;
    int freeSlot = -1;
    for (int i = 0; i < MAX_TRACKED_PETS; ++i) {
      if (s_collarHeartbeats[i].collarId == collarId) { slot = i; break; }
      if (s_collarHeartbeats[i].collarId.isEmpty() && freeSlot < 0) freeSlot = i;
    }
    if (slot < 0) slot = freeSlot >= 0 ? freeSlot : 0;
    if (s_collarHeartbeats[slot].collarId == collarId &&
        s_collarHeartbeats[slot].lastSentMs != 0 &&
        now - s_collarHeartbeats[slot].lastSentMs < COLLAR_HEARTBEAT_MS) return;

    WiFiClient client;
    HTTPClient http;
    http.begin(client, cfg.backendHost + "/device/collar-heartbeat");
    http.setTimeout(HTTP_TIMEOUT_MS);
    http.addHeader("Content-Type", "application/json");
    char body[180];
    snprintf(body, sizeof(body),
             "{\"source_main_id\":\"%s\",\"collar_id\":\"%s\",\"rssi\":%d}",
             identity::deviceId().c_str(), collarId, rssi);
    int code = http.POST((uint8_t *)body, strlen(body));
    Serial.printf("[hb] collar=%s via main=%s -> HTTP %d\n",
                  collarId, identity::deviceId().c_str(), code);
    http.end();
    if (code >= 200 && code < 300) {
      s_collarHeartbeats[slot].collarId = collarId;
      s_collarHeartbeats[slot].lastSentMs = now;
    }
  }

  int postVideoFrame(const netcfg::Config &cfg, const ble::PetHit &hit, const uint8_t *jpeg, size_t len)
  {
    if (WiFi.status() != WL_CONNECTED) return -1;
    DynamicJsonDocument doc(1024);
    doc["device_id"] = identity::deviceId();
    JsonArray pets = doc.createNestedArray("pets");
    for (uint8_t i = 0; i < hit.count; ++i) {
      JsonObject item = pets.createNestedObject(); item["collar_id"] = hit.nearby[i].collar_id;
      item["pet_id"] = hit.nearby[i].pet_id; item["rssi"] = hit.nearby[i].rssi;
    }
    String meta; serializeJson(doc, meta);
    String boundary = "----video" + String(millis());
    String head = "--" + boundary + "\r\nContent-Disposition: form-data; name=\"meta\"\r\n\r\n" + meta +
      "\r\n--" + boundary + "\r\nContent-Disposition: form-data; name=\"photo\"; filename=\"frame.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n";
    String tail = "\r\n--" + boundary + "--\r\n";
    size_t total = head.length() + len + tail.length();
    uint8_t *body = (uint8_t *)(psramFound() ? ps_malloc(total) : malloc(total)); if (!body) return -2;
    memcpy(body, head.c_str(), head.length()); memcpy(body + head.length(), jpeg, len); memcpy(body + head.length() + len, tail.c_str(), tail.length());
    WiFiClient client; HTTPClient http; http.begin(client, cfg.backendHost + "/video/frame"); http.setTimeout(HTTP_TIMEOUT_MS);
    http.addHeader("Content-Type", "multipart/form-data; boundary=" + boundary); int code = http.POST(body, total); http.end(); free(body); return code;
  }

  void endVideo(const netcfg::Config &cfg, const char *reason)
  {
    if (WiFi.status() != WL_CONNECTED) return;
    WiFiClient client; HTTPClient http; http.begin(client, cfg.backendHost + "/video/end"); http.addHeader("Content-Type", "application/json");
    String body = "{\"device_id\":\"" + identity::deviceId() + "\",\"reason\":\"" + reason + "\"}"; http.POST(body); http.end();
  }

} // namespace up
