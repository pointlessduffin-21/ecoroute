package com.ecoroute.app.ble

import android.annotation.SuppressLint
import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.os.Build
import android.os.ParcelUuid
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import java.nio.ByteBuffer
import java.nio.ByteOrder
import javax.inject.Inject
import javax.inject.Singleton

data class ScannedDevice(
    val name: String,
    val address: String,
    val rssi: Int,
)

data class DeviceConfig(
    val wifiSsid: String = "",
    val wifiPassword: String = "",
    val deviceCode: String = "",
    val apiUrl: String = "",
    val reportIntervalSec: Int = 900,
    val binHeightCm: Float = 100f,
)

data class DeviceStatus(
    val isWifiConnected: Boolean = false,
    val isConfigured: Boolean = false,
    val batteryVoltage: Float = 0f,
    val firmwareVersion: String = "",
    val deviceCode: String = "",
    val reportInterval: Int = 0,
)

@Singleton
class BleManager @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    companion object {
        private const val TAG = "BleManager"
    }

    private val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager.adapter

    private var scanner: BluetoothLeScanner? = null
    private var scanCallback: ScanCallback? = null
    private var gatt: BluetoothGatt? = null

    private val _scannedDevices = MutableStateFlow<List<ScannedDevice>>(emptyList())
    val scannedDevices: StateFlow<List<ScannedDevice>> = _scannedDevices.asStateFlow()

    private val _isScanning = MutableStateFlow(false)
    val isScanning: StateFlow<Boolean> = _isScanning.asStateFlow()

    private val _isConnected = MutableStateFlow(false)
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    // Continuation for GATT callbacks
    private var gattConnectionCont: CancellableContinuation<Boolean>? = null
    private var gattServicesCont: CancellableContinuation<Boolean>? = null
    private var gattWriteCont: CancellableContinuation<Boolean>? = null
    private var gattReadCont: CancellableContinuation<ByteArray?>? = null
    private var gattMtuCont: CancellableContinuation<Boolean>? = null

    // ─── Scanning ───────────────────────────────────────────────────────────

    @SuppressLint("MissingPermission")
    fun startScan() {
        if (_isScanning.value) return

        scanner = bluetoothAdapter?.bluetoothLeScanner ?: run {
            Log.e(TAG, "BLE scanner not available")
            return
        }

        _scannedDevices.value = emptyList()
        _isScanning.value = true

        val filters = listOf(
            ScanFilter.Builder()
                .setServiceUuid(ParcelUuid(BleConstants.SERVICE_UUID))
                .build()
        )
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()

        scanCallback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                val device = result.device
                val name = device.name ?: return
                val address = device.address
                val rssi = result.rssi

                val current = _scannedDevices.value.toMutableList()
                val existing = current.indexOfFirst { it.address == address }
                val scannedDevice = ScannedDevice(name, address, rssi)

                if (existing >= 0) {
                    current[existing] = scannedDevice
                } else {
                    current.add(scannedDevice)
                }
                _scannedDevices.value = current
            }

            override fun onScanFailed(errorCode: Int) {
                Log.e(TAG, "Scan failed with error code: $errorCode")
                _isScanning.value = false
            }
        }

        scanner?.startScan(filters, settings, scanCallback)
        Log.d(TAG, "BLE scan started")
    }

    @SuppressLint("MissingPermission")
    fun stopScan() {
        scanCallback?.let { scanner?.stopScan(it) }
        scanCallback = null
        _isScanning.value = false
        Log.d(TAG, "BLE scan stopped")
    }

    // ─── Connection ─────────────────────────────────────────────────────────

    @SuppressLint("MissingPermission")
    suspend fun connect(address: String): Boolean {
        val device = bluetoothAdapter?.getRemoteDevice(address) ?: return false

        // Connect GATT
        val connected = suspendCancellableCoroutine { cont ->
            gattConnectionCont = cont
            gatt = device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
            cont.invokeOnCancellation { gatt?.close() }
        }

        if (!connected) return false

        // Request MTU for long writes
        suspendCancellableCoroutine { cont ->
            gattMtuCont = cont
            gatt?.requestMtu(512)
            cont.invokeOnCancellation { }
        }

        // Discover services
        val servicesDiscovered = suspendCancellableCoroutine { cont ->
            gattServicesCont = cont
            gatt?.discoverServices()
            cont.invokeOnCancellation { }
        }

        _isConnected.value = servicesDiscovered
        return servicesDiscovered
    }

    @SuppressLint("MissingPermission")
    fun disconnect() {
        gatt?.disconnect()
        gatt?.close()
        gatt = null
        _isConnected.value = false
        Log.d(TAG, "Disconnected")
    }

    // ─── Read/Write Operations ──────────────────────────────────────────────

    @SuppressLint("MissingPermission")
    suspend fun readStatus(): DeviceStatus? {
        val data = readCharacteristic(BleConstants.CHAR_STATUS) ?: return null
        val json = String(data)
        Log.d(TAG, "Status: $json")

        return try {
            val gson = com.google.gson.Gson()
            val map = gson.fromJson(json, Map::class.java)
            DeviceStatus(
                isWifiConnected = (map["wifi"] as? Boolean) ?: false,
                isConfigured = (map["configured"] as? Boolean) ?: false,
                batteryVoltage = ((map["battery"] as? Number)?.toFloat()) ?: 0f,
                firmwareVersion = (map["fw"] as? String) ?: "",
                deviceCode = (map["deviceCode"] as? String) ?: "",
                reportInterval = ((map["interval"] as? Number)?.toInt()) ?: 0,
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse status: ${e.message}")
            null
        }
    }

    @SuppressLint("MissingPermission")
    suspend fun writeConfig(config: DeviceConfig) {
        // Write each field sequentially
        writeCharacteristic(BleConstants.CHAR_WIFI_SSID, config.wifiSsid.toByteArray())
        delay(100)

        writeCharacteristic(BleConstants.CHAR_WIFI_PASS, config.wifiPassword.toByteArray())
        delay(100)

        writeCharacteristic(BleConstants.CHAR_DEVICE_CODE, config.deviceCode.toByteArray())
        delay(100)

        writeCharacteristic(BleConstants.CHAR_API_URL, config.apiUrl.toByteArray())
        delay(100)

        // Interval as uint32 little-endian
        val intervalBytes = ByteBuffer.allocate(4)
            .order(ByteOrder.LITTLE_ENDIAN)
            .putInt(config.reportIntervalSec)
            .array()
        writeCharacteristic(BleConstants.CHAR_INTERVAL, intervalBytes)
        delay(100)

        // Bin height as float32 little-endian
        val heightBytes = ByteBuffer.allocate(4)
            .order(ByteOrder.LITTLE_ENDIAN)
            .putFloat(config.binHeightCm)
            .array()
        writeCharacteristic(BleConstants.CHAR_BIN_HEIGHT, heightBytes)
        delay(100)
    }

    @SuppressLint("MissingPermission")
    suspend fun sendCommand(command: Byte) {
        writeCharacteristic(BleConstants.CHAR_COMMAND, byteArrayOf(command))
    }

    // ─── Low-level GATT operations ──────────────────────────────────────────

    @SuppressLint("MissingPermission")
    private suspend fun writeCharacteristic(uuid: java.util.UUID, data: ByteArray): Boolean {
        val service = gatt?.getService(BleConstants.SERVICE_UUID) ?: return false
        val characteristic = service.getCharacteristic(uuid) ?: return false

        return suspendCancellableCoroutine { cont ->
            gattWriteCont = cont
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                gatt?.writeCharacteristic(
                    characteristic,
                    data,
                    BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                )
            } else {
                @Suppress("DEPRECATION")
                characteristic.value = data
                @Suppress("DEPRECATION")
                gatt?.writeCharacteristic(characteristic)
            }
            cont.invokeOnCancellation { }
        }
    }

    @SuppressLint("MissingPermission")
    private suspend fun readCharacteristic(uuid: java.util.UUID): ByteArray? {
        val service = gatt?.getService(BleConstants.SERVICE_UUID) ?: return null
        val characteristic = service.getCharacteristic(uuid) ?: return null

        return suspendCancellableCoroutine { cont ->
            gattReadCont = cont
            gatt?.readCharacteristic(characteristic)
            cont.invokeOnCancellation { }
        }
    }

    // ─── GATT Callback ─────────────────────────────────────────────────────

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            Log.d(TAG, "Connection state: $newState (status: $status)")
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                gattConnectionCont?.resumeWith(Result.success(true))
                gattConnectionCont = null
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                gattConnectionCont?.resumeWith(Result.success(false))
                gattConnectionCont = null
                _isConnected.value = false
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            val success = status == BluetoothGatt.GATT_SUCCESS
            Log.d(TAG, "Services discovered: $success")
            gattServicesCont?.resumeWith(Result.success(success))
            gattServicesCont = null
        }

        override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
            Log.d(TAG, "MTU changed to $mtu (status: $status)")
            gattMtuCont?.resumeWith(Result.success(status == BluetoothGatt.GATT_SUCCESS))
            gattMtuCont = null
        }

        @Deprecated("Deprecated in Java")
        override fun onCharacteristicRead(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int,
        ) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                @Suppress("DEPRECATION")
                gattReadCont?.resumeWith(Result.success(characteristic.value))
            } else {
                gattReadCont?.resumeWith(Result.success(null))
            }
            gattReadCont = null
        }

        override fun onCharacteristicWrite(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int,
        ) {
            val success = status == BluetoothGatt.GATT_SUCCESS
            Log.d(TAG, "Write ${characteristic.uuid}: $success")
            gattWriteCont?.resumeWith(Result.success(success))
            gattWriteCont = null
        }
    }
}
