package com.ecoroute.app.ble

import java.util.UUID

object BleConstants {
    val SERVICE_UUID: UUID         = UUID.fromString("eco10001-b1n0-4ec0-b1n0-ec0r0ute0000")
    val CHAR_WIFI_SSID: UUID       = UUID.fromString("eco10002-b1n0-4ec0-b1n0-ec0r0ute0000")
    val CHAR_WIFI_PASS: UUID       = UUID.fromString("eco10003-b1n0-4ec0-b1n0-ec0r0ute0000")
    val CHAR_DEVICE_CODE: UUID     = UUID.fromString("eco10004-b1n0-4ec0-b1n0-ec0r0ute0000")
    val CHAR_API_URL: UUID         = UUID.fromString("eco10005-b1n0-4ec0-b1n0-ec0r0ute0000")
    val CHAR_INTERVAL: UUID        = UUID.fromString("eco10006-b1n0-4ec0-b1n0-ec0r0ute0000")
    val CHAR_BIN_HEIGHT: UUID      = UUID.fromString("eco10007-b1n0-4ec0-b1n0-ec0r0ute0000")
    val CHAR_STATUS: UUID          = UUID.fromString("eco10008-b1n0-4ec0-b1n0-ec0r0ute0000")
    val CHAR_COMMAND: UUID         = UUID.fromString("eco10009-b1n0-4ec0-b1n0-ec0r0ute0000")

    const val CMD_SAVE_AND_RESTART: Byte = 0x01
    const val CMD_FORCE_REPORT: Byte     = 0x02
    const val CMD_FACTORY_RESET: Byte    = 0x03

    const val SCAN_TIMEOUT_MS = 10000L
    const val BLE_DEVICE_NAME_PREFIX = "ECO-BIN-"
}
