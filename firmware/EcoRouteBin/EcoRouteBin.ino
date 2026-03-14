/*
 * EcoRoute Smart Bin — MQTT Simulator
 *
 * Publishes simulated telemetry to MQTT broker.
 * No sensors, no BLE — just WiFi + MQTT with fake data.
 *
 * Hardware: ESP32 (any dev board)
 *
 * MQTT Broker: 109.123.238.215:1883
 * Topic:       ecoroute/trash_can/<DEVICE_CODE>
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ─── CONFIGURE THESE ────────────────────────────────────────────────────────
#define WIFI_SSID           "Duffin's Tecno"
#define WIFI_PASSWORD       "yeems214"

#define DEVICE_CODE         "ECO-BIN-001"
#define BIN_HEIGHT_CM       100.0f

#define MQTT_BROKER         "109.123.238.215"
#define MQTT_PORT           1883
#define MQTT_TOPIC_PREFIX   "ecoroute/trash_can/"

#define REPORT_INTERVAL_SEC 30        // how often to publish (seconds)
// ─────────────────────────────────────────────────────────────────────────────

#define FIRMWARE_VERSION    "1.0.0-sim"
#define LED_PIN             2

WiFiClient   wifiClient;
PubSubClient mqtt(wifiClient);

float simulatedFillPercent = 0.0f;
bool  fillRising = true;

// ─── WiFi ────────────────────────────────────────────────────────────────────

void connectWifi() {
  Serial.printf("[wifi] Connecting to '%s'...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[wifi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[wifi] FAILED — check SSID/password. Restarting in 10s...");
    delay(10000);
    ESP.restart();
  }
}

// ─── MQTT ────────────────────────────────────────────────────────────────────

void connectMqtt() {
  String clientId = String("ecoroute-") + DEVICE_CODE;

  while (!mqtt.connected()) {
    Serial.printf("[mqtt] Connecting to %s:%d...\n", MQTT_BROKER, MQTT_PORT);
    if (mqtt.connect(clientId.c_str())) {
      Serial.println("[mqtt] Connected!");
    } else {
      Serial.printf("[mqtt] Failed (rc=%d). Retrying in 5s...\n", mqtt.state());
      delay(5000);
    }
  }
}

// ─── Simulated Telemetry ─────────────────────────────────────────────────────

void publishTelemetry() {
  // Simulate fill level slowly rising then dropping (like a real bin cycle)
  if (fillRising) {
    simulatedFillPercent += 2.0f + (float)(esp_random() % 30) / 10.0f; // +2.0–5.0%
    if (simulatedFillPercent >= 95.0f) {
      fillRising = false; // bin gets emptied
    }
  } else {
    simulatedFillPercent = 5.0f + (float)(esp_random() % 100) / 10.0f; // reset to 5–15%
    fillRising = true;
  }
  simulatedFillPercent = constrain(simulatedFillPercent, 0.0f, 100.0f);

  float distanceCm = BIN_HEIGHT_CM * (1.0f - simulatedFillPercent / 100.0f);
  float batteryVoltage = 3.6f + (float)(esp_random() % 60) / 100.0f; // 3.6–4.2V
  int32_t rssi = WiFi.RSSI();

  // Build JSON
  JsonDocument doc;
  doc["device_code"]        = DEVICE_CODE;
  doc["fill_level_percent"] = round(simulatedFillPercent * 10.0f) / 10.0f;
  doc["distance_cm"]        = round(distanceCm * 10.0f) / 10.0f;
  doc["battery_voltage"]    = round(batteryVoltage * 100.0f) / 100.0f;
  doc["signal_strength"]    = rssi;
  doc["anomaly_flag"]       = false;
  doc["firmware_version"]   = FIRMWARE_VERSION;

  char payload[256];
  size_t len = serializeJson(doc, payload, sizeof(payload));

  // Publish
  String topic = String(MQTT_TOPIC_PREFIX) + DEVICE_CODE;
  bool ok = mqtt.publish(topic.c_str(), payload, len);

  Serial.printf("[mqtt] %s → %s\n", topic.c_str(), payload);
  Serial.printf("[mqtt] %s\n", ok ? "OK" : "PUBLISH FAILED");
}

// ─── Arduino Entry Points ────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(100);

  Serial.println();
  Serial.println("========================================");
  Serial.println("  EcoRoute MQTT Simulator v" FIRMWARE_VERSION);
  Serial.println("  Device: " DEVICE_CODE);
  Serial.println("  Broker: " MQTT_BROKER);
  Serial.printf( "  Interval: %ds\n", REPORT_INTERVAL_SEC);
  Serial.println("========================================");
  Serial.println();

  pinMode(LED_PIN, OUTPUT);

  connectWifi();

  mqtt.setServer(MQTT_BROKER, MQTT_PORT);
  connectMqtt();

  // Publish first reading immediately
  publishTelemetry();
}

void loop() {
  // Reconnect if needed
  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
  }
  if (!mqtt.connected()) {
    connectMqtt();
  }
  mqtt.loop();

  // Publish on interval
  static unsigned long lastPublish = 0;
  if (millis() - lastPublish >= (unsigned long)REPORT_INTERVAL_SEC * 1000UL) {
    digitalWrite(LED_PIN, HIGH);
    publishTelemetry();
    digitalWrite(LED_PIN, LOW);
    lastPublish = millis();
  }

  delay(100);
}
