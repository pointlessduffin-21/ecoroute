#ifndef ECOROUTE_CONFIG_MANAGER_H
#define ECOROUTE_CONFIG_MANAGER_H

#include <Arduino.h>
#include <Preferences.h>
#include "config.h"

class ConfigManager {
public:
  void begin();

  // Check if device has been provisioned
  bool isConfigured();
  void markConfigured();

  // WiFi credentials
  String getWifiSsid();
  void setWifiSsid(const String& ssid);
  String getWifiPassword();
  void setWifiPassword(const String& password);

  // Device identity
  String getDeviceCode();
  void setDeviceCode(const String& code);

  // API settings
  String getApiUrl();
  void setApiUrl(const String& url);
  String getApiKey();
  void setApiKey(const String& key);

  // Reporting interval in seconds
  uint32_t getReportInterval();
  void setReportInterval(uint32_t seconds);

  // Bin physical height in cm
  float getBinHeight();
  void setBinHeight(float cm);

  // Factory reset - clears all stored config
  void factoryReset();

private:
  Preferences _prefs;
  static const char* NVS_NAMESPACE;
};

#endif // ECOROUTE_CONFIG_MANAGER_H
