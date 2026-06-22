// net_config.cpp — Persistencia de la config de red en NVS (Preferences).
#include "net_config.h"
#include <Preferences.h>
#include "config.h"

namespace netcfg
{

  static const char *NS = "petrack";

  Config load()
  {
    Preferences p;
    p.begin(NS, true); // solo lectura
    Config c;
    c.ssid = p.getString("ssid", DEFAULT_WIFI_SSID);
    c.pass = p.getString("pass", DEFAULT_WIFI_PASS);
    c.backendHost = p.getString("backend", DEFAULT_BACKEND_HOST);
    c.residence = p.getString("residence", DEFAULT_RESIDENCE);
    p.end();
    return c;
  }

  void save(const Config &c)
  {
    Preferences p;
    p.begin(NS, false);
    p.putString("ssid", c.ssid);
    p.putString("pass", c.pass);
    p.putString("backend", c.backendHost);
    p.putString("residence", c.residence);
    p.end();
  }

} // namespace netcfg
