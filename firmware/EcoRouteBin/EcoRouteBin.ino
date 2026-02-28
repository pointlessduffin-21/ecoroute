/*
 * EcoRoute Smart Bin Firmware v1.0.0
 *
 * Hardware: ESP32 + HC-SR04 Ultrasonic Sensor (optional)
 *
 * Features:
 *   - BLE provisioning (WiFi creds, device code, API URL, interval, bin height)
 *   - Ultrasonic distance → fill level calculation (when sensor connected)
 *   - HTTP POST telemetry to backend API
 *   - Deep sleep between reports for power saving
 *   - Powered via USB / powerbank (no battery ADC needed)
 *
 * Wiring (when ultrasonic sensor connected):
 *   HC-SR04 TRIG → GPIO 5
 *   HC-SR04 ECHO → GPIO 18
 *
 * Set SENSOR_CONNECTED to false if no HC-SR04 is attached (sends simulated data).
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <ArduinoJson.h>
#include "config.h"

// ─── Forward declarations for structs ───────────────────────────────────────
struct SensorReading {
  float distanceCm;
  float fillLevelPercent;
  float batteryVoltage;
  int32_t signalStrength;
  bool anomalyFlag;
};

// ─── Forward declarations for functions using SensorReading ─────────────────
SensorReading readAllSensors(float binHeightCm);
bool postTelemetry(const char* url, const char* apiKey, const char* deviceCode, const SensorReading& r);

// ═══════════════════════════════════════════════════════════════════════════
//  CONFIGURATION MANAGER (NVS)
// ═══════════════════════════════════════════════════════════════════════════

Preferences prefs;

void configBegin() {
  prefs.begin("ecoroute", false);
  Serial.println("[config] NVS initialized");
}

bool configIsConfigured() { return prefs.getBool("configured", false); }
void configMarkConfigured() { prefs.putBool("configured", true); }

String configGetWifiSsid()      { return prefs.getString("wifi_ssid", ""); }
void   configSetWifiSsid(const String& v) { prefs.putString("wifi_ssid", v); }
String configGetWifiPass()      { return prefs.getString("wifi_pass", ""); }
void   configSetWifiPass(const String& v) { prefs.putString("wifi_pass", v); }
String configGetDeviceCode()    { return prefs.getString("device_code", ""); }
void   configSetDeviceCode(const String& v) { prefs.putString("device_code", v); }
String configGetApiUrl()        { return prefs.getString("api_url", DEFAULT_API_URL); }
void   configSetApiUrl(const String& v) { prefs.putString("api_url", v); }
String configGetApiKey()        { return prefs.getString("api_key", DEFAULT_API_KEY); }
void   configSetApiKey(const String& v) { prefs.putString("api_key", v); }

uint32_t configGetInterval() { return prefs.getUInt("interval", DEFAULT_REPORT_INTERVAL_SEC); }
void     configSetInterval(uint32_t v) { prefs.putUInt("interval", v); }
float    configGetBinHeight() { return prefs.getFloat("bin_height", DEFAULT_BIN_HEIGHT_CM); }
void     configSetBinHeight(float v) { prefs.putFloat("bin_height", v); }

void configFactoryReset() {
  Serial.println("[config] Factory reset!");
  prefs.clear();
}

// ═══════════════════════════════════════════════════════════════════════════
//  SENSOR READER
// ═══════════════════════════════════════════════════════════════════════════

void sortFloats(float arr[], int size) {
  for (int i = 0; i < size - 1; i++)
    for (int j = 0; j < size - i - 1; j++)
      if (arr[j] > arr[j + 1]) { float t = arr[j]; arr[j] = arr[j+1]; arr[j+1] = t; }
}

void sensorsBegin() {
#if SENSOR_CONNECTED
  pinMode(HCSR04_TRIG_PIN, OUTPUT);
  pinMode(HCSR04_ECHO_PIN, INPUT);
  digitalWrite(HCSR04_TRIG_PIN, LOW);
  Serial.println("[sensor] HC-SR04 initialized");
#else
  Serial.println("[sensor] HC-SR04 NOT connected — using simulated data");
#endif

#if BATTERY_MONITORING
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);
  Serial.println("[sensor] Battery ADC initialized");
#else
  Serial.println("[sensor] Battery monitoring OFF — reporting USB power (5.0V)");
#endif
}

float readDistanceCm() {
#if SENSOR_CONNECTED
  float samples[NUM_DISTANCE_SAMPLES];
  int valid = 0;

  for (int i = 0; i < NUM_DISTANCE_SAMPLES; i++) {
    digitalWrite(HCSR04_TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(HCSR04_TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(HCSR04_TRIG_PIN, LOW);

    long duration = pulseIn(HCSR04_ECHO_PIN, HIGH, ECHO_TIMEOUT_US);
    if (duration > 0) {
      samples[valid++] = (float)duration * 0.0343f / 2.0f;
    }
    delay(SAMPLE_DELAY_MS);
  }

  if (valid == 0) {
    Serial.println("[sensor] HC-SR04: No valid readings");
    return -1.0f;
  }

  sortFloats(samples, valid);
  float median = samples[valid / 2];
  Serial.printf("[sensor] Distance: %.1f cm (median of %d)\n", median, valid);
  return median;
#else
  // Simulated: random distance between 10-90 cm for testing
  float simulated = 10.0f + (float)(esp_random() % 800) / 10.0f;
  Serial.printf("[sensor] Distance (simulated): %.1f cm\n", simulated);
  return simulated;
#endif
}

float readBatteryVoltage() {
#if BATTERY_MONITORING
  long sum = 0;
  for (int i = 0; i < 10; i++) { sum += analogRead(BATTERY_ADC_PIN); delay(5); }
  float voltage = ((float)sum / 10.0f / 4095.0f) * ADC_VREF * VOLTAGE_DIVIDER_RATIO;
  Serial.printf("[sensor] Battery: %.2fV\n", voltage);
  return voltage;
#else
  // USB/powerbank powered — report fixed 5.0V
  Serial.println("[sensor] Battery: 5.00V (USB power)");
  return 5.0f;
#endif
}

SensorReading readAllSensors(float binHeightCm) {
  SensorReading r;
  r.distanceCm = readDistanceCm();
  r.batteryVoltage = readBatteryVoltage();
  r.signalStrength = WiFi.RSSI();

  if (r.distanceCm >= 0 && binHeightCm > 0) {
    float ratio = 1.0f - (r.distanceCm / binHeightCm);
    r.fillLevelPercent = constrain(ratio * 100.0f, 0.0f, 100.0f);
  } else {
    r.fillLevelPercent = 0.0f;
  }

  r.anomalyFlag = (r.distanceCm < 0 || r.distanceCm > 300.0f);

  Serial.printf("[sensor] Fill: %.1f%% | Dist: %.1f cm | Batt: %.2fV | RSSI: %d | Anomaly: %s\n",
    r.fillLevelPercent, r.distanceCm, r.batteryVoltage, r.signalStrength,
    r.anomalyFlag ? "YES" : "no");
  return r;
}

// ═══════════════════════════════════════════════════════════════════════════
//  WIFI MANAGER
// ═══════════════════════════════════════════════════════════════════════════

bool wifiConnect(const char* ssid, const char* password) {
  Serial.printf("[wifi] Connecting to '%s'...\n", ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start > WIFI_CONNECT_TIMEOUT_MS) {
      Serial.println("[wifi] Timeout!");
      WiFi.disconnect(true);
      return false;
    }
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\n[wifi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
  return true;
}

void wifiDisconnect() {
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
}

// ═══════════════════════════════════════════════════════════════════════════
//  HTTP CLIENT
// ═══════════════════════════════════════════════════════════════════════════

bool postTelemetry(const char* url, const char* apiKey, const char* deviceCode, const SensorReading& r) {
  HTTPClient http;
  http.begin(url);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-API-Key", apiKey);

  JsonDocument doc;
  doc["deviceCode"] = deviceCode;
  doc["fillLevelPercent"] = round(r.fillLevelPercent * 10.0f) / 10.0f;
  doc["distanceCm"] = round(r.distanceCm * 10.0f) / 10.0f;
  doc["batteryVoltage"] = round(r.batteryVoltage * 100.0f) / 100.0f;
  doc["signalStrength"] = r.signalStrength;
  doc["anomalyFlag"] = r.anomalyFlag;

  String payload;
  serializeJson(doc, payload);
  Serial.printf("[http] POST %s\n[http] %s\n", url, payload.c_str());

  int code = http.POST(payload);
  if (code > 0) {
    String resp = http.getString();
    Serial.printf("[http] %d: %s\n", code, resp.c_str());
    http.end();
    return (code == 201);
  } else {
    Serial.printf("[http] Error: %s\n", http.errorToString(code).c_str());
    http.end();
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  BLE PROVISIONING
// ═══════════════════════════════════════════════════════════════════════════

static BLEServer* bleServer = nullptr;
static BLECharacteristic* statusChar = nullptr;
static bool bleClientConnected = false;
static volatile bool cmdSave = false;
static volatile bool cmdForceReport = false;
static volatile bool cmdFactoryReset = false;

class BleServerCB : public BLEServerCallbacks {
  void onConnect(BLEServer* s) override    { bleClientConnected = true;  Serial.println("[ble] Connected"); }
  void onDisconnect(BLEServer* s) override { bleClientConnected = false; Serial.println("[ble] Disconnected"); s->startAdvertising(); }
};

class WifiSsidCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override { configSetWifiSsid(String(c->getValue().c_str())); Serial.printf("[ble] SSID: %s\n", c->getValue().c_str()); }
};
class WifiPassCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override { configSetWifiPass(String(c->getValue().c_str())); Serial.println("[ble] Password set"); }
};
class DeviceCodeCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override { configSetDeviceCode(String(c->getValue().c_str())); Serial.printf("[ble] Code: %s\n", c->getValue().c_str()); }
  void onRead(BLECharacteristic* c)  override { c->setValue(configGetDeviceCode().c_str()); }
};
class ApiUrlCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override { configSetApiUrl(String(c->getValue().c_str())); Serial.printf("[ble] URL: %s\n", c->getValue().c_str()); }
};
class IntervalCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    if (c->getLength() >= 4) { uint32_t v; memcpy(&v, c->getData(), 4); configSetInterval(v); Serial.printf("[ble] Interval: %us\n", v); }
  }
  void onRead(BLECharacteristic* c) override { uint32_t v = configGetInterval(); c->setValue((uint8_t*)&v, 4); }
};
class BinHeightCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    if (c->getLength() >= 4) { float v; memcpy(&v, c->getData(), 4); configSetBinHeight(v); Serial.printf("[ble] Height: %.1fcm\n", v); }
  }
  void onRead(BLECharacteristic* c) override { float v = configGetBinHeight(); c->setValue((uint8_t*)&v, 4); }
};
class CommandCB : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* c) override {
    if (c->getLength() >= 1) {
      uint8_t cmd = c->getData()[0];
      Serial.printf("[ble] CMD: 0x%02X\n", cmd);
      if (cmd == CMD_SAVE_AND_RESTART) cmdSave = true;
      else if (cmd == CMD_FORCE_REPORT) cmdForceReport = true;
      else if (cmd == CMD_FACTORY_RESET) cmdFactoryReset = true;
    }
  }
};

void bleUpdateStatus(float battery, bool wifiOk) {
  if (!statusChar) return;
  JsonDocument doc;
  doc["wifi"] = wifiOk;
  doc["configured"] = configIsConfigured();
  doc["battery"] = round(battery * 100.0f) / 100.0f;
  doc["fw"] = FIRMWARE_VERSION;
  doc["deviceCode"] = configGetDeviceCode();
  doc["interval"] = configGetInterval();
  String json; serializeJson(doc, json);
  statusChar->setValue(json.c_str());
  statusChar->notify();
}

void bleBegin(const char* name) {
  cmdSave = cmdForceReport = cmdFactoryReset = false;
  BLEDevice::init(name);
  BLEDevice::setMTU(512);

  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new BleServerCB());

  BLEService* svc = bleServer->createService(BLEUUID(SERVICE_UUID), 30);

  auto* c1 = svc->createCharacteristic(BLEUUID(CHAR_WIFI_SSID_UUID), BLECharacteristic::PROPERTY_WRITE);
  c1->setCallbacks(new WifiSsidCB());

  auto* c2 = svc->createCharacteristic(BLEUUID(CHAR_WIFI_PASS_UUID), BLECharacteristic::PROPERTY_WRITE);
  c2->setCallbacks(new WifiPassCB());

  auto* c3 = svc->createCharacteristic(BLEUUID(CHAR_DEVICE_CODE_UUID), BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE);
  c3->setCallbacks(new DeviceCodeCB());
  String code = configGetDeviceCode();
  if (code.length() > 0) c3->setValue(code.c_str());

  auto* c4 = svc->createCharacteristic(BLEUUID(CHAR_API_URL_UUID), BLECharacteristic::PROPERTY_WRITE);
  c4->setCallbacks(new ApiUrlCB());

  auto* c5 = svc->createCharacteristic(BLEUUID(CHAR_INTERVAL_UUID), BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE);
  c5->setCallbacks(new IntervalCB());
  uint32_t iv = configGetInterval(); c5->setValue((uint8_t*)&iv, 4);

  auto* c6 = svc->createCharacteristic(BLEUUID(CHAR_BIN_HEIGHT_UUID), BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE);
  c6->setCallbacks(new BinHeightCB());
  float bh = configGetBinHeight(); c6->setValue((uint8_t*)&bh, 4);

  statusChar = svc->createCharacteristic(BLEUUID(CHAR_STATUS_UUID), BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  statusChar->addDescriptor(new BLE2902());

  auto* c8 = svc->createCharacteristic(BLEUUID(CHAR_COMMAND_UUID), BLECharacteristic::PROPERTY_WRITE);
  c8->setCallbacks(new CommandCB());

  svc->start();

  BLEAdvertising* adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(BLEUUID(SERVICE_UUID));
  adv->setScanResponse(true);
  adv->setMinPreferred(0x06);
  BLEDevice::startAdvertising();

  Serial.printf("[ble] Advertising as '%s'\n", name);
}

void bleStop() {
  if (bleServer) { BLEDevice::deinit(false); bleServer = nullptr; statusChar = nullptr; }
}

// ═══════════════════════════════════════════════════════════════════════════
//  DEEP SLEEP
// ═══════════════════════════════════════════════════════════════════════════

void enterDeepSleep(uint32_t seconds) {
  Serial.printf("[main] Deep sleep for %u seconds...\n", seconds);
  Serial.flush();
  gpio_hold_en((gpio_num_t)HCSR04_TRIG_PIN);
  gpio_deep_sleep_hold_en();
  esp_sleep_enable_timer_wakeup((uint64_t)seconds * 1000000ULL);
  esp_deep_sleep_start();
}

// ═══════════════════════════════════════════════════════════════════════════
//  PROVISIONING MODE
// ═══════════════════════════════════════════════════════════════════════════

void runProvisioningMode() {
  Serial.println("\n=== PROVISIONING MODE ===");
  Serial.println("Waiting for BLE configuration from mobile app...\n");

  // Build BLE device name
  String devName;
  String stored = configGetDeviceCode();
  if (stored.length() > 0) {
    devName = stored;
  } else {
    uint64_t mac = ESP.getEfuseMac();
    char buf[5]; snprintf(buf, sizeof(buf), "%04X", (uint16_t)(mac >> 32));
    devName = String(BLE_DEVICE_NAME_PREFIX) + buf;
  }

  sensorsBegin();
  float batt = readBatteryVoltage();

  bleBegin(devName.c_str());
  bleUpdateStatus(batt, false);

  pinMode(LED_PIN, OUTPUT);
  uint32_t startMs = millis();
  uint32_t lastBlink = 0;
  bool ledOn = false;

  while (true) {
    if (cmdSave) {
      cmdSave = false;
      String ssid = configGetWifiSsid();
      String code = configGetDeviceCode();
      String url  = configGetApiUrl();

      if (ssid.length() > 0 && code.length() > 0 && url.length() > 0) {
        configMarkConfigured();
        Serial.println("[main] Config saved. Restarting...");
        delay(500);
        ESP.restart();
      } else {
        Serial.println("[main] Incomplete! Need SSID + device code + API URL");
      }
    }

    if (cmdFactoryReset) {
      cmdFactoryReset = false;
      configFactoryReset();
      Serial.println("[main] Factory reset. Restarting...");
      delay(500);
      ESP.restart();
    }

    if (cmdForceReport) {
      cmdForceReport = false;
      Serial.println("[main] Force report ignored in provisioning mode");
    }

    // Blink LED
    if (millis() - lastBlink > 500) { ledOn = !ledOn; digitalWrite(LED_PIN, ledOn); lastBlink = millis(); }

    // Status update every 5s
    static uint32_t lastStatus = 0;
    if (millis() - lastStatus > 5000) { batt = readBatteryVoltage(); bleUpdateStatus(batt, false); lastStatus = millis(); }

    // BLE timeout → sleep 60s then retry
    if (millis() - startMs > (uint32_t)BLE_ADVERTISING_TIMEOUT_SEC * 1000) {
      Serial.println("[main] BLE timeout. Sleeping 60s...");
      bleStop();
      enterDeepSleep(60);
    }

    delay(100);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  REPORTING MODE
// ═══════════════════════════════════════════════════════════════════════════

void runReportingMode() {
  Serial.println("\n=== REPORTING MODE ===");

  String ssid   = configGetWifiSsid();
  String pass   = configGetWifiPass();
  String code   = configGetDeviceCode();
  String url    = configGetApiUrl();
  String apiKey = configGetApiKey();
  float height  = configGetBinHeight();
  uint32_t interval = configGetInterval();

  Serial.printf("Device: %s | Height: %.0fcm | Interval: %us\n", code.c_str(), height, interval);
  Serial.printf("API: %s\n\n", url.c_str());

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);

  // 1. Connect WiFi
  if (!wifiConnect(ssid.c_str(), pass.c_str())) {
    Serial.println("[main] WiFi failed. Retry in 60s...");
    enterDeepSleep(60);
    return;
  }

  // 2. Read sensors
  sensorsBegin();
  SensorReading reading = readAllSensors(height);

  // 3. POST telemetry
  bool ok = postTelemetry(url.c_str(), apiKey.c_str(), code.c_str(), reading);
  Serial.printf("[main] Telemetry %s\n", ok ? "SENT" : "FAILED");

  // 4. Sleep
  wifiDisconnect();
  digitalWrite(LED_PIN, LOW);
  enterDeepSleep(interval);
}

// ═══════════════════════════════════════════════════════════════════════════
//  ARDUINO ENTRY POINTS
// ═══════════════════════════════════════════════════════════════════════════

void setup() {
  Serial.begin(115200);
  delay(100);

  Serial.println();
  Serial.println("========================================");
  Serial.println("  EcoRoute Smart Bin Firmware v" FIRMWARE_VERSION);
  Serial.println("========================================");

  esp_sleep_wakeup_cause_t wake = esp_sleep_get_wakeup_cause();
  Serial.println(wake == ESP_SLEEP_WAKEUP_TIMER ? "[main] Woke from deep sleep" : "[main] Fresh boot");

  configBegin();

  if (configIsConfigured()) {
    runReportingMode();
  } else {
    runProvisioningMode();
  }
}

void loop() {
  // Only reached in provisioning mode (which has its own loop)
  delay(1000);
}
