import { test, expect, mock, describe, beforeEach } from "bun:test";
import { Hono } from "hono";

// --- Drizzle Mocking Setup ---
let nextMockData: any = [];

const handler = {
  get(target: any, prop: string) {
    if (prop === "then") {
      return (resolve: any) => resolve(nextMockData);
    }
    return new Proxy(() => {}, handler);
  },
  apply(target: any, thisArg: any, argumentsList: any[]) {
    return new Proxy(() => {}, handler);
  }
};
const mockDb = new Proxy(() => {}, handler);

// Mock the database BEFORE importing the router
mock.module("../config/database", () => {
  return {
    getDb: () => mockDb,
    getSql: () => ({ end: () => {} }),
    closeDb: () => {}
  };
});

import telemetryApp from "./telemetry";
import type { AppVariables } from "../types/context";

describe("Telemetry API Routes", () => {
  let app: Hono<{ Variables: AppVariables }>;

  beforeEach(() => {
    app = new Hono<{ Variables: AppVariables }>();
    app.route("/telemetry", telemetryApp);
    nextMockData = []; // Default mock reset
  });

  test("POST /telemetry - Fails validation with invalid body", async () => {
    const res = await app.request("http://localhost/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fillLevelPercent: 150 }) // Missing deviceId and fill > 100
    });

    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.error).toBe("Validation failed");
  });

  test("POST /telemetry - Returns 404 if device not found", async () => {
    nextMockData = []; // No device found

    const res = await app.request("http://localhost/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: "123e4567-e89b-12d3-a456-426614174000",
        fillLevelPercent: 75
      })
    });

    expect(res.status).toBe(404);
    const data = await res.json() as any;
    expect(data.error).toBe("Device not found");
  });

  test("POST /telemetry - Successfully inserts telemetry", async () => {
    // Both the check device query and insert query will return this array
    nextMockData = [{ id: "mock-id-1234", fillLevelPercent: 50 }];

    const res = await app.request("http://localhost/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: "123e4567-e89b-12d3-a456-426614174000",
        fillLevelPercent: 50
      })
    });

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.data.id).toBe("mock-id-1234");
  });

  test("GET /telemetry/latest - Requires subdivisionId", async () => {
    const res = await app.request("http://localhost/telemetry/latest");
    expect(res.status).toBe(400);
  });

  test("GET /telemetry/latest - Returns latest stats", async () => {
    nextMockData = [{ device_id: "test", fill_level_percent: 50 }];

    const res = await app.request("http://localhost/telemetry/latest?subdivisionId=123e4567-e89b-12d3-a456-426614174000");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.data.length).toBe(1);
  });

  test("GET /telemetry/stats - Returns aggregated stats", async () => {
    nextMockData = [{ active_devices: 1, avg_fill_level: 50 }];

    const res = await app.request("http://localhost/telemetry/stats?subdivisionId=123e4567-e89b-12d3-a456-426614174000");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.data.active_devices).toBe(1);
  });
});
