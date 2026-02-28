#ifndef ECOROUTE_BLE_PROVISIONING_H
#define ECOROUTE_BLE_PROVISIONING_H

#include <Arduino.h>
#include "config_manager.h"

class BleProvisioning {
public:
  // Initialize BLE GATT server with provisioning service
  void begin(ConfigManager* configManager, const char* deviceName);

  // Stop BLE advertising and deinit
  void stop();

  // Check if a mobile app client is connected
  bool isClientConnected();

  // Check if a save command (0x01) was received
  bool hasSaveCommand();

  // Check if a force-report command (0x02) was received
  bool hasForceReportCommand();

  // Check if a factory-reset command (0x03) was received
  bool hasFactoryResetCommand();

  // Clear command flags
  void clearCommands();

  // Update the status characteristic with current device info
  void updateStatus(float batteryVoltage, bool wifiConnected);
};

#endif // ECOROUTE_BLE_PROVISIONING_H
