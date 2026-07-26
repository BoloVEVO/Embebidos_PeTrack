#ifndef COLLAR_IDENTITY_H
#define COLLAR_IDENTITY_H

#include <Arduino.h>

namespace identity {
struct Identity {
  String collarId;
  String petId;
  String mainDeviceId;
  bool paired;
};

Identity load();
bool assignMain(const String &mainDeviceId);
bool setPetId(const String &petId);
}  // namespace identity

#endif
