#include "identity.h"
#include <Preferences.h>
#include <esp_mac.h>
#include "config.h"

namespace identity {
static const char *NS = "petrack";

static String chipId(const char *prefix) {
  uint8_t mac[6];
  esp_efuse_mac_get_default(mac);
  char out[24];
  snprintf(out, sizeof(out), "%s-%02X%02X%02X%02X%02X%02X", prefix,
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  return String(out);
}

Identity load() {
  Preferences p;
  p.begin(NS, false);
  Identity id;
  id.collarId = chipId("col");
  if (p.getString("collar_id", "") != id.collarId) {
    p.putString("collar_id", id.collarId);
  }
  id.petId = p.getString("pet_id", DEFAULT_PET_ID).substring(0, MAX_PET_ID_LEN);
  id.mainDeviceId = p.getString("main_id", "");
  id.paired = !id.mainDeviceId.isEmpty();
  p.end();
  return id;
}

bool assignMain(const String &mainDeviceId) {
  if (mainDeviceId.isEmpty() || mainDeviceId.length() > 23) return false;
  Preferences p;
  p.begin(NS, false);
  bool ok = p.putString("main_id", mainDeviceId) > 0;
  p.end();
  return ok;
}

bool setPetId(const String &petId) {
  if (petId.isEmpty() || petId.length() > MAX_PET_ID_LEN) return false;
  Preferences p;
  p.begin(NS, false);
  bool ok = p.putString("pet_id", petId) > 0;
  p.end();
  return ok;
}
}  // namespace identity
