// net_config.h — Config de red en NVS (WiFi + backend + residencia).
#ifndef DEVICE_NET_CONFIG_H
#define DEVICE_NET_CONFIG_H

#include <Arduino.h>

namespace netcfg {

struct Config {
  String ssid;
  String pass;
  String backendHost;  // ej. http://192.168.1.100:3000
  String residence;    // residencia de ESTE dispositivo (dónde detecta)
};

Config load();              // lee NVS con fallback a defaults de config.h
void save(const Config &c); // persiste en NVS (para portal/GUI futura)

}  // namespace netcfg

#endif  // DEVICE_NET_CONFIG_H
