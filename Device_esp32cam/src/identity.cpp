#include "identity.h"
#include <Preferences.h>
#include <esp_mac.h>

namespace identity {
String deviceId() {
  static String cached;
  if (!cached.isEmpty()) return cached;
  Preferences p;
  p.begin("petrack", false);
  uint8_t mac[6];
  esp_efuse_mac_get_default(mac);
  char out[24];
  snprintf(out, sizeof(out), "cam-%02X%02X%02X%02X%02X%02X",
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  cached = out;
  if (p.getString("device_id", "") != cached) {
    p.putString("device_id", cached);
  }
  p.end();
  return cached;
}
}
