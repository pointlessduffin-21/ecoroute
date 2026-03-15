/*
 * EcoRoute Smart Bin — Full Firmware
 *
 * Boot sequence:
 *   1. If no config stored → start WiFi AP + BLE provisioning simultaneously.
 *      User can provision via:
 *        a) Browser at http://192.168.4.1  (connect to ECO-BIN-SETUP)
 *        b) EcoRoute Android app via BLE
 *   2. Once config exists → connect to saved WiFi → publish MQTT telemetry.
 *
 * To use this file instead of main.cpp:
 *   In platformio.ini, set: src_filter = +<main_full.cpp> -<main.cpp>
 */

// NOTE: main.cpp is the MQTT simulator. Only one main() can be compiled.
// Exclude main.cpp from the build when using this file.

#include <Arduino.h>
#include <WiFi.h>

#include "config.h"
#include "config_manager.h"
#include "sensor_reader.h"
#include "wifi_manager.h"
#include "mqtt_client.h"
#include "http_client.h"
#include "ble_provisioning.h"
#include "ap_provisioning.h"

// ─── Module instances ────────────────────────────────────────────────────────

static ConfigManager   configManager;
static SensorReader    sensorReader;
static WifiManager     wifiManager;
static MqttClient      mqttClient;
static HttpClient      httpClient;
static BleProvisioning bleProvisioning;
static ApProvisioning  apProvisioning;

// ─── State machine ───────────────────────────────────────────────────────────

enum class State {
  PROVISIONING,   // No config — AP + BLE advertising
  CONNECTING,     // Config found — connecting to WiFi
  REPORTING,      // Connected — publishing telemetry on interval
};

static State     g_state        = State::PROVISIONING;
static uint32_t  g_lastReport   = 0;
static uint32_t  g_provStartMs  = 0;
static float     g_battery      = 0.0f;

// ─── Helpers ─────────────────────────────────────────────────────────────────

static void enterProvisioning() {
  g_state       = State::PROVISIONING;
  g_provStartMs = millis();

  // Read battery once before starting AP so the status page can show it
  g_battery = sensorReader.readBattery();

  // BLE provisioning
  String deviceName = String(BLE_DEVICE_NAME_PREFIX) + configManager.getDeviceCode();
  bleProvisioning.begin(&configManager, deviceName.c_str());

  // WiFi AP provisioning (runs in parallel with BLE)
  apProvisioning.begin(&configManager, g_battery);

  Serial.println("[main] Provisioning mode: BLE + WiFi AP active");
  Serial.printf("[main] Connect to WiFi SSID 'ECO-BIN-SETUP' (pw: ecoroute123) or use BLE\n");
  Serial.printf("[main] Open http://192.168.4.1 in your browser\n");

  digitalWrite(LED_PIN, HIGH); // solid LED = provisioning
}

static void enterReporting() {
  bleProvisioning.stop();
  apProvisioning.stop();

  g_state = State::CONNECTING;
  Serial.println("[main] Config found — connecting to WiFi...");

  bool ok = wifiManager.connect(
    configManager.getWifiSsid().c_str(),
    configManager.getWifiPassword().c_str(),
    WIFI_CONNECT_TIMEOUT_MS
  );

  if (!ok) {
    Serial.println("[main] WiFi connect failed — re-entering provisioning");
    enterProvisioning();
    return;
  }

  g_state = State::REPORTING;
  Serial.printf("[main] WiFi connected: %s\n", wifiManager.getLocalIp().c_str());

  // Connect MQTT
  mqttClient.begin(
    MQTT_BROKER_HOST,
    MQTT_BROKER_PORT,
    configManager.getDeviceCode().c_str()
  );
  mqttClient.connect(MQTT_CONNECT_TIMEOUT_MS);

  g_lastReport = 0; // Publish immediately on first loop iteration
  digitalWrite(LED_PIN, LOW);
}

static void publishTelemetry() {
  float fillPercent = sensorReader.readFillLevel(configManager.getBinHeight());
  g_battery         = sensorReader.readBattery();
  int32_t rssi      = WiFi.RSSI();
  bool anomaly      = (fillPercent > 95.0f);

  // Build JSON payload
  char payload[256];
  snprintf(payload, sizeof(payload),
    "{\"device_code\":\"%s\",\"fill_level_percent\":%.1f,"
    "\"distance_cm\":%.1f,\"battery_voltage\":%.2f,"
    "\"signal_strength\":%d,\"anomaly_flag\":%s,"
    "\"firmware_version\":\"%s\"}",
    configManager.getDeviceCode().c_str(),
    fillPercent,
    configManager.getBinHeight() * (1.0f - fillPercent / 100.0f),
    g_battery,
    rssi,
    anomaly ? "true" : "false",
    FIRMWARE_VERSION
  );

  // Try MQTT first; fall back to HTTP
  bool sent = false;
  if (mqttClient.isConnected()) {
    String topic = String(MQTT_TOPIC_PREFIX) + configManager.getDeviceCode();
    sent = mqttClient.publish(topic.c_str(), payload);
    Serial.printf("[mqtt] %s → %s\n", sent ? "OK" : "FAIL", payload);
  }

  if (!sent) {
    Serial.println("[mqtt] Not connected — falling back to HTTP");
    sent = httpClient.post(
      configManager.getApiUrl().c_str(),
      DEFAULT_API_KEY,
      payload
    );
    Serial.printf("[http] %s\n", sent ? "OK" : "FAIL");
  }

  if (sent) {
    // Blink LED to indicate successful report
    digitalWrite(LED_PIN, HIGH);
    delay(100);
    digitalWrite(LED_PIN, LOW);
  }
}

// ─── Arduino entry points ────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(100);

  Serial.println();
  Serial.println("========================================");
  Serial.println("  EcoRoute Smart Bin v" FIRMWARE_VERSION);
  Serial.println("========================================");

  pinMode(LED_PIN, OUTPUT);
  sensorReader.begin();
  configManager.begin();

  if (configManager.isConfigured()) {
    Serial.println("[main] Config found in NVS");
    enterReporting();
  } else {
    Serial.println("[main] No config — starting provisioning");
    enterProvisioning();
  }
}

void loop() {
  switch (g_state) {
    case State::PROVISIONING: {
      // Handle BLE commands
      if (bleProvisioning.hasSaveCommand()) {
        bleProvisioning.clearCommands();
        Serial.println("[ble] Save command received");
        enterReporting();
        break;
      }
      if (bleProvisioning.hasFactoryResetCommand()) {
        bleProvisioning.clearCommands();
        configManager.factoryReset();
        Serial.println("[ble] Factory reset");
        ESP.restart();
        break;
      }
      bleProvisioning.updateStatus(g_battery, false);

      // Handle WiFi AP HTTP requests; returns true when /configure was POSTed
      bool apDone = apProvisioning.handle();
      if (apDone) {
        Serial.println("[ap] Config saved via HTTP — restarting...");
        delay(500);
        ESP.restart();
      }

      // BLE advertising timeout — keep AP alive but stop BLE to save power
      uint32_t elapsed = millis() - g_provStartMs;
      if (elapsed > (uint32_t)BLE_ADVERTISING_TIMEOUT_SEC * 1000UL) {
        bleProvisioning.stop();
        Serial.println("[ble] Advertising timed out (AP still active)");
      }

      delay(10);
      break;
    }

    case State::CONNECTING:
      // enterReporting() transitions us out of this state synchronously
      break;

    case State::REPORTING: {
      // Reconnect WiFi / MQTT if dropped
      if (!wifiManager.isConnected()) {
        Serial.println("[wifi] Lost connection — reconnecting...");
        wifiManager.connect(
          configManager.getWifiSsid().c_str(),
          configManager.getWifiPassword().c_str(),
          WIFI_CONNECT_TIMEOUT_MS
        );
      }
      if (!mqttClient.isConnected()) {
        mqttClient.connect(MQTT_CONNECT_TIMEOUT_MS);
      }
      mqttClient.loop();

      uint32_t now      = millis();
      uint32_t interval = configManager.getReportInterval() * 1000UL;
      if (now - g_lastReport >= interval) {
        publishTelemetry();
        g_lastReport = now;
      }

      delay(100);
      break;
    }
  }
}
