#include "ap_provisioning.h"
#include "config.h"
#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>

// ─── Module-level server (WebServer lives for the duration of AP mode) ────────

static WebServer*    g_server  = nullptr;
static ApProvisioning* g_self  = nullptr;

// ─── HTML setup page (minimal, no external deps) ─────────────────────────────

static const char SETUP_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>EcoRoute Bin Setup</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:sans-serif;background:#f0fdf4;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}
  .card{background:#fff;border-radius:12px;padding:24px;width:100%;max-width:420px;box-shadow:0 2px 12px rgba(0,0,0,.1)}
  h1{font-size:1.2rem;font-weight:700;color:#15803d;margin-bottom:4px}
  p.sub{font-size:.85rem;color:#6b7280;margin-bottom:20px}
  label{display:block;font-size:.85rem;font-weight:600;margin-bottom:4px;color:#374151}
  input,select{width:100%;padding:10px 12px;border:1px solid #d1fae5;border-radius:8px;font-size:.95rem;margin-bottom:14px;outline:none}
  input:focus,select:focus{border-color:#16a34a;box-shadow:0 0 0 2px #bbf7d0}
  button{width:100%;padding:12px;background:#16a34a;color:#fff;border:none;border-radius:8px;font-size:1rem;font-weight:600;cursor:pointer;margin-top:4px}
  button:hover{background:#15803d}
  .badge{display:inline-block;background:#dcfce7;color:#15803d;font-size:.75rem;padding:2px 8px;border-radius:99px;font-weight:600;margin-bottom:16px}
  .msg{margin-top:12px;padding:10px 14px;border-radius:8px;font-size:.9rem;display:none}
  .msg.ok{background:#dcfce7;color:#15803d;display:block}
  .msg.err{background:#fee2e2;color:#b91c1c;display:block}
</style>
</head><body>
<div class="card">
  <h1>EcoRoute Smart Bin</h1>
  <p class="sub">WiFi Provisioning</p>
  <span class="badge" id="badge">Not configured</span>

  <form id="form">
    <label>WiFi Network (SSID)</label>
    <input name="wifiSsid" id="ssid" placeholder="Your home/office WiFi" required>

    <label>WiFi Password</label>
    <input name="wifiPassword" id="pass" type="password" placeholder="Leave blank for open networks">

    <label>Device Code</label>
    <input name="deviceCode" id="code" placeholder="ECO-BIN-001" required>

    <label>API Server URL</label>
    <input name="apiUrl" id="url" placeholder="http://192.168.1.x:3000/api/v1/device/telemetry" required>

    <label>Report Interval</label>
    <select name="reportInterval" id="interval">
      <option value="300">5 minutes</option>
      <option value="600">10 minutes</option>
      <option value="900" selected>15 minutes</option>
      <option value="1800">30 minutes</option>
      <option value="3600">1 hour</option>
    </select>

    <label>Bin Height (cm)</label>
    <input name="binHeight" id="height" type="number" min="20" max="300" value="100" required>

    <button type="submit" id="btn">Save &amp; Connect</button>
    <div class="msg" id="msg"></div>
  </form>
</div>

<script>
async function loadStatus() {
  try {
    const r = await fetch('/status');
    const d = await r.json();
    if (d.configured) {
      document.getElementById('badge').textContent = 'Already configured';
    }
    if (d.deviceCode) document.getElementById('code').value = d.deviceCode;
    if (d.interval)   document.getElementById('interval').value = d.interval;
    if (d.binHeight)  document.getElementById('height').value = d.binHeight;
  } catch(_) {}
}
loadStatus();

document.getElementById('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn');
  const msg = document.getElementById('msg');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  msg.className = 'msg';

  const body = {
    wifiSsid:       document.getElementById('ssid').value.trim(),
    wifiPassword:   document.getElementById('pass').value,
    deviceCode:     document.getElementById('code').value.trim(),
    apiUrl:         document.getElementById('url').value.trim(),
    reportInterval: parseInt(document.getElementById('interval').value),
    binHeight:      parseFloat(document.getElementById('height').value),
  };

  try {
    const r = await fetch('/configure', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (r.ok) {
      msg.className = 'msg ok';
      msg.textContent = 'Saved! The device will restart and connect to your WiFi in a moment.';
    } else {
      msg.className = 'msg err';
      msg.textContent = d.error || 'Save failed.';
      btn.disabled = false;
      btn.textContent = 'Save & Connect';
    }
  } catch(err) {
    msg.className = 'msg err';
    msg.textContent = 'Network error: ' + err.message;
    btn.disabled = false;
    btn.textContent = 'Save & Connect';
  }
});
</script>
</body></html>
)rawliteral";

// ─── ApProvisioning ──────────────────────────────────────────────────────────

void ApProvisioning::begin(ConfigManager* configManager, float batteryVoltage) {
  m_config  = configManager;
  m_battery = batteryVoltage;
  m_restartRequested = false;
  g_self   = this;

  // Build AP name: "ECO-BIN-SETUP" or "ECO-BIN-SETUP-<code_suffix>"
  String apSsid = "ECO-BIN-SETUP";
  String code = m_config->getDeviceCode();
  if (code.length() > 0) {
    // Use last 4 chars of device code as suffix so multiple units can coexist
    String suffix = code.length() > 4 ? code.substring(code.length() - 4) : code;
    apSsid = "ECO-BIN-" + suffix;
  }

  WiFi.mode(WIFI_AP);
  WiFi.softAP(apSsid.c_str(), "ecoroute123");
  Serial.printf("[ap] SoftAP started: SSID='%s' IP=%s\n",
                apSsid.c_str(),
                WiFi.softAPIP().toString().c_str());

  g_server = new WebServer(80);
  g_server->on("/",         HTTP_GET,  []{ g_self->handleRoot();      });
  g_server->on("/status",   HTTP_GET,  []{ g_self->handleStatus();    });
  g_server->on("/configure",HTTP_POST, []{ g_self->handleConfigure(); });
  g_server->on("/restart",  HTTP_GET,  []{ g_self->handleRestart();   });
  g_server->begin();
  Serial.println("[ap] HTTP server listening on port 80");
}

bool ApProvisioning::handle() {
  if (g_server) g_server->handleClient();
  return m_restartRequested;
}

void ApProvisioning::stop() {
  if (g_server) {
    g_server->stop();
    delete g_server;
    g_server = nullptr;
  }
  WiFi.softAPdisconnect(true);
  WiFi.mode(WIFI_OFF);
  Serial.println("[ap] Stopped");
}

// ─── HTTP handlers ───────────────────────────────────────────────────────────

void ApProvisioning::handleRoot() {
  g_server->sendHeader("Cache-Control", "no-cache");
  g_server->send_P(200, "text/html", SETUP_HTML);
}

void ApProvisioning::handleStatus() {
  JsonDocument doc;
  doc["configured"] = m_config->isConfigured();
  doc["deviceCode"] = m_config->getDeviceCode();
  doc["fw"]         = FIRMWARE_VERSION;
  doc["battery"]    = round(m_battery * 100.0f) / 100.0f;
  doc["interval"]   = m_config->getReportInterval();
  doc["binHeight"]  = m_config->getBinHeight();

  String json;
  serializeJson(doc, json);
  g_server->sendHeader("Access-Control-Allow-Origin", "*");
  g_server->send(200, "application/json", json);
}

void ApProvisioning::handleConfigure() {
  if (!g_server->hasArg("plain")) {
    g_server->send(400, "application/json", "{\"error\":\"No body\"}");
    return;
  }

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, g_server->arg("plain"));
  if (err) {
    g_server->send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
    return;
  }

  const char* ssid    = doc["wifiSsid"]   | "";
  const char* pass    = doc["wifiPassword"]| "";
  const char* code    = doc["deviceCode"] | "";
  const char* apiUrl  = doc["apiUrl"]     | "";
  uint32_t interval   = doc["reportInterval"] | (uint32_t)DEFAULT_REPORT_INTERVAL_SEC;
  float    binHeight  = doc["binHeight"]  | DEFAULT_BIN_HEIGHT_CM;

  if (strlen(ssid) == 0 || strlen(code) == 0 || strlen(apiUrl) == 0) {
    g_server->send(400, "application/json",
                   "{\"error\":\"wifiSsid, deviceCode, and apiUrl are required\"}");
    return;
  }

  m_config->setWifiSsid(String(ssid));
  m_config->setWifiPassword(String(pass));
  m_config->setDeviceCode(String(code));
  m_config->setApiUrl(String(apiUrl));
  m_config->setReportInterval(interval);
  m_config->setBinHeight(binHeight);

  Serial.printf("[ap] Config saved: SSID=%s code=%s interval=%u\n", ssid, code, interval);

  g_server->sendHeader("Access-Control-Allow-Origin", "*");
  g_server->send(200, "application/json", "{\"ok\":true,\"message\":\"Config saved. Restarting...\"}");

  // Schedule restart after response is sent
  m_restartRequested = true;
}

void ApProvisioning::handleRestart() {
  g_server->send(200, "application/json", "{\"ok\":true}");
  m_restartRequested = true;
}
