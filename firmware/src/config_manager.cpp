#include "config_manager.h"

const char* ConfigManager::NVS_NAMESPACE = "ecoroute";

void ConfigManager::begin() {
  _prefs.begin(NVS_NAMESPACE, false);
  Serial.println("[config] NVS initialized");
}

bool ConfigManager::isConfigured() {
  return _prefs.getBool("configured", false);
}

void ConfigManager::markConfigured() {
  _prefs.putBool("configured", true);
}

// ─── WiFi ───────────────────────────────────────────────────────────────────

String ConfigManager::getWifiSsid() {
  return _prefs.getString("wifi_ssid", "");
}

void ConfigManager::setWifiSsid(const String& ssid) {
  _prefs.putString("wifi_ssid", ssid);
}

String ConfigManager::getWifiPassword() {
  return _prefs.getString("wifi_pass", "");
}

void ConfigManager::setWifiPassword(const String& password) {
  _prefs.putString("wifi_pass", password);
}

// ─── Device Identity ────────────────────────────────────────────────────────

String ConfigManager::getDeviceCode() {
  return _prefs.getString("device_code", "");
}

void ConfigManager::setDeviceCode(const String& code) {
  _prefs.putString("device_code", code);
}

// ─── API Settings ───────────────────────────────────────────────────────────

String ConfigManager::getApiUrl() {
  return _prefs.getString("api_url", DEFAULT_API_URL);
}

void ConfigManager::setApiUrl(const String& url) {
  _prefs.putString("api_url", url);
}

String ConfigManager::getApiKey() {
  return _prefs.getString("api_key", DEFAULT_API_KEY);
}

void ConfigManager::setApiKey(const String& key) {
  _prefs.putString("api_key", key);
}

// ─── Reporting ──────────────────────────────────────────────────────────────

uint32_t ConfigManager::getReportInterval() {
  return _prefs.getUInt("interval", DEFAULT_REPORT_INTERVAL_SEC);
}

void ConfigManager::setReportInterval(uint32_t seconds) {
  _prefs.putUInt("interval", seconds);
}

// ─── Bin Height ─────────────────────────────────────────────────────────────

float ConfigManager::getBinHeight() {
  return _prefs.getFloat("bin_height", DEFAULT_BIN_HEIGHT_CM);
}

void ConfigManager::setBinHeight(float cm) {
  _prefs.putFloat("bin_height", cm);
}

// ─── Factory Reset ──────────────────────────────────────────────────────────

void ConfigManager::factoryReset() {
  Serial.println("[config] Factory reset - clearing all NVS data");
  _prefs.clear();
}
