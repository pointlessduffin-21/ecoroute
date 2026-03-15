#pragma once

#include <Arduino.h>
#include "config_manager.h"

/**
 * WiFi AP Provisioning
 *
 * When the device has no stored WiFi credentials, it starts a SoftAP so the
 * user can configure it without requiring a separate BLE-capable device.
 *
 * AP SSID:     ECO-BIN-SETUP (or ECO-BIN-SETUP-<suffix> if a device code exists)
 * AP Password: ecoroute123
 * IP address:  192.168.4.1
 *
 * HTTP endpoints served at 192.168.4.1:
 *   GET  /          → HTML setup page with configuration form
 *   GET  /status    → JSON: { configured, deviceCode, fw, battery }
 *   POST /configure → JSON body: saves config and schedules restart
 *   GET  /restart   → triggers ESP.restart() immediately
 */
class ApProvisioning {
public:
  /**
   * Start the SoftAP and HTTP server.
   * @param configManager  Reference to the NVS config manager.
   * @param batteryVoltage Latest battery reading (shown on status page).
   */
  void begin(ConfigManager* configManager, float batteryVoltage = 0.0f);

  /**
   * Call in loop() — processes pending HTTP client connections.
   * Returns true once the user has submitted a valid configuration and the
   * device should restart (caller should call ESP.restart() shortly after).
   */
  bool handle();

  /** Stop the HTTP server and disable the SoftAP. */
  void stop();

  /** Returns true if a save-and-restart was requested via /configure. */
  bool restartRequested() const { return m_restartRequested; }

private:
  ConfigManager* m_config   = nullptr;
  float          m_battery  = 0.0f;
  bool           m_restartRequested = false;

  void handleRoot();
  void handleStatus();
  void handleConfigure();
  void handleRestart();
};
