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

import binsApp from "./bins";
import type { AppVariables } from "../types/context";

describe("Smart Bins API Routes", () => {
  let app: Hono<{ Variables: AppVariables }>;

  beforeEach(() => {
    app = new Hono<{ Variables: AppVariables }>();
    
    // Mock authentication middleware
    app.use("*", async (c, next) => {
      const roleHeader = c.req.header("X-Mock-Role");
      if (roleHeader) {
        c.set("user", {
          id: "test-user-id",
          email: "test@ecoroute.io",
          role: roleHeader as "admin" | "dispatcher" | "maintenance",
          subdivisionId: "test-sub-id",
          fullName: "Test User"
        });
      }
      await next();
    });

    app.route("/bins", binsApp);
    nextMockData = []; // Default mock reset
  });

  test("GET /bins - Returns paginated list of bins", async () => {
    nextMockData = [{ id: "mock-bin-1" }]; // Returns items then count

    const res = await app.request("http://localhost/bins");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.data.length).toBe(1);
    expect(data.pagination).toBeDefined();
  });

  test("GET /bins/:id - Returns 404 if bin not found", async () => {
    nextMockData = []; // No bin array returned

    const res = await app.request("http://localhost/bins/123");
    expect(res.status).toBe(404);
  });

  test("POST /bins - Rejects creation if not admin/dispatcher", async () => {
    const res = await app.request("http://localhost/bins", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mock-Role": "driver" // driver role cannot create bins
      },
      body: JSON.stringify({
        subdivisionId: "123e4567-e89b-12d3-a456-426614174000",
        deviceCode: "ECO-BIN-TEST",
        latitude: 10,
        longitude: 10
      })
    });

    expect(res.status).toBe(403);
  });

  test("POST /bins - Admin can create bin", async () => {
    nextMockData = [{ id: "new-bin-123" }];

    const res = await app.request("http://localhost/bins", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Mock-Role": "admin" // admin role allows creation
      },
      body: JSON.stringify({
        subdivisionId: "123e4567-e89b-12d3-a456-426614174000",
        deviceCode: "ECO-BIN-TEST",
        latitude: 10,
        longitude: 10
      })
    });

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.data.id).toBe("new-bin-123");
  });

  test("PUT /bins/:id - Fails on invalid data", async () => {
    const res = await app.request("http://localhost/bins/123", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Mock-Role": "dispatcher"
      },
      body: JSON.stringify({ capacityLiters: -50 }) // invalid capacity
    });

    expect(res.status).toBe(400);
  });

  test("DELETE /bins/:id - Sets to inactive", async () => {
    nextMockData = [{ id: "123", status: "inactive" }];

    const res = await app.request("http://localhost/bins/123", {
      method: "DELETE",
      headers: { "X-Mock-Role": "admin" }
    });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.data.status).toBe("inactive");
  });
});
