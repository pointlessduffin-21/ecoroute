#ifndef ECOROUTE_CONFIG_H
#define ECOROUTE_CONFIG_H

#include <Arduino.h>

// ─── Firmware Version ───────────────────────────────────────────────────────
#define FIRMWARE_VERSION "1.0.0"

// ─── HC-SR04 Ultrasonic Sensor ──────────────────────────────────────────────
#define HCSR04_TRIG_PIN     GPIO_NUM_5
#define HCSR04_ECHO_PIN     GPIO_NUM_18

// ─── Battery Voltage ADC ────────────────────────────────────────────────────
// Voltage divider: R1=100k, R2=100k → max 4.2V reads as ~2.1V on ADC
// Uses ADC1 (ADC2 conflicts with WiFi)
#define BATTERY_ADC_PIN         GPIO_NUM_34   // ADC1_CH6
#define VOLTAGE_DIVIDER_RATIO   2.0f
#define ADC_VREF                3.3f

// ─── BLE Configuration ─────────────────────────────────────────────────────
#define BLE_DEVICE_NAME_PREFIX  "ECO-BIN-"

// BLE GATT UUIDs
#define SERVICE_UUID            "eco10001-b1n0-4ec0-b1n0-ec0r0ute0000"
#define CHAR_WIFI_SSID_UUID     "eco10002-b1n0-4ec0-b1n0-ec0r0ute0000"
#define CHAR_WIFI_PASS_UUID     "eco10003-b1n0-4ec0-b1n0-ec0r0ute0000"
#define CHAR_DEVICE_CODE_UUID   "eco10004-b1n0-4ec0-b1n0-ec0r0ute0000"
#define CHAR_API_URL_UUID       "eco10005-b1n0-4ec0-b1n0-ec0r0ute0000"
#define CHAR_INTERVAL_UUID      "eco10006-b1n0-4ec0-b1n0-ec0r0ute0000"
#define CHAR_BIN_HEIGHT_UUID    "eco10007-b1n0-4ec0-b1n0-ec0r0ute0000"
#define CHAR_STATUS_UUID        "eco10008-b1n0-4ec0-b1n0-ec0r0ute0000"
#define CHAR_COMMAND_UUID       "eco10009-b1n0-4ec0-b1n0-ec0r0ute0000"

// BLE Commands
#define CMD_SAVE_AND_RESTART    0x01
#define CMD_FORCE_REPORT        0x02
#define CMD_FACTORY_RESET       0x03

// ─── Default Configuration ──────────────────────────────────────────────────
#define DEFAULT_REPORT_INTERVAL_SEC  900      // 15 minutes
#define DEFAULT_BIN_HEIGHT_CM        100.0f
#define DEFAULT_API_URL              "http://10.0.2.2:3000/api/v1/device/telemetry"
#define DEFAULT_API_KEY              "ecoroute-device-key-change-in-production"

// ─── Timing ─────────────────────────────────────────────────────────────────
#define WIFI_CONNECT_TIMEOUT_MS      15000
#define HTTP_TIMEOUT_MS              10000
#define BLE_ADVERTISING_TIMEOUT_SEC  300    // 5 minutes

// ─── Sensor Sampling ────────────────────────────────────────────────────────
#define NUM_DISTANCE_SAMPLES    5
#define SAMPLE_DELAY_MS         60
#define MAX_DISTANCE_CM         400.0f    // HC-SR04 max range
#define ECHO_TIMEOUT_US         30000     // ~5m max distance

// ─── Status LED ─────────────────────────────────────────────────────────────
#define LED_PIN                 GPIO_NUM_2  // Onboard LED

#endif // ECOROUTE_CONFIG_H
