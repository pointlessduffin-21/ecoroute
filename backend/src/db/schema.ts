import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  jsonb,
  pgEnum,
  index,
  real,
  serial,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "dispatcher",
  "maintenance",
]);

export const binStatusEnum = pgEnum("bin_status", [
  "active",
  "inactive",
  "maintenance",
  "offline",
]);

export const alertTypeEnum = pgEnum("alert_type", [
  "overflow",
  "low_battery",
  "sensor_anomaly",
  "offline",
]);

export const alertSeverityEnum = pgEnum("alert_severity", [
  "low",
  "medium",
  "high",
  "critical",
]);

export const routeStatusEnum = pgEnum("route_status", [
  "planned",
  "in_progress",
  "completed",
  "cancelled",
]);

export const stopStatusEnum = pgEnum("stop_status", [
  "pending",
  "arrived",
  "serviced",
  "skipped",
]);

export const notificationChannelEnum = pgEnum("notification_channel", [
  "push",
  "sms",
  "email",
  "in_app",
]);

// ─── 1. Subdivisions ─────────────────────────────────────────────────────────

export const subdivisions = pgTable(
  "subdivision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 255 }).notNull(),
    code: varchar("code", { length: 50 }).notNull().unique(),
    // Store geofence as GeoJSON text; use PostGIS functions for spatial queries
    geofence: text("geofence"),
    address: text("address"),
    contactEmail: varchar("contact_email", { length: 255 }),
    contactPhone: varchar("contact_phone", { length: 50 }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("idx_subdivision_code").on(table.code)]
);

// ─── 2. Users ─────────────────────────────────────────────────────────────────

export const users = pgTable(
  "user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subdivisionId: uuid("subdivision_id").references(() => subdivisions.id),
    email: varchar("email", { length: 255 }).notNull().unique(),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    role: userRoleEnum("role").notNull().default("maintenance"),
    phone: varchar("phone", { length: 50 }),
    avatarUrl: text("avatar_url"),
    passwordHash: text("password_hash"),
    isActive: boolean("is_active").default(true).notNull(),
    supabaseUid: uuid("supabase_uid").unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_user_email").on(table.email),
    index("idx_user_subdivision").on(table.subdivisionId),
    index("idx_user_role").on(table.role),
  ]
);

// ─── 3. Smart Bins ────────────────────────────────────────────────────────────

export const smartBins = pgTable(
  "smart_bin",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subdivisionId: uuid("subdivision_id")
      .references(() => subdivisions.id)
      .notNull(),
    deviceCode: varchar("device_code", { length: 100 }).notNull().unique(),
    imei: varchar("imei", { length: 20 }).unique(),
    // Store lat/lng separately; use PostGIS point in raw SQL for spatial queries
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    capacityLiters: real("capacity_liters").notNull().default(120),
    thresholdPercent: real("threshold_percent").notNull().default(80),
    status: binStatusEnum("status").notNull().default("active"),
    installDate: timestamp("install_date", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    firmwareVersion: varchar("firmware_version", { length: 50 }),
    photoUrl: text("photo_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_bin_subdivision").on(table.subdivisionId),
    index("idx_bin_device_code").on(table.deviceCode),
    index("idx_bin_status").on(table.status),
  ]
);

// ─── 4. Bin Telemetry ─────────────────────────────────────────────────────────

export const binTelemetry = pgTable(
  "bin_telemetry",
  {
    id: serial("id").primaryKey(),
    deviceId: uuid("device_id")
      .references(() => smartBins.id)
      .notNull(),
    fillLevelPercent: real("fill_level_percent").notNull(),
    distanceCm: real("distance_cm"),
    batteryVoltage: real("battery_voltage"),
    signalStrength: integer("signal_strength"),
    anomalyFlag: boolean("anomaly_flag").default(false).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_telemetry_device").on(table.deviceId),
    index("idx_telemetry_recorded_at").on(table.recordedAt),
    index("idx_telemetry_device_time").on(table.deviceId, table.recordedAt),
  ]
);

// ─── 5. Fill Predictions ──────────────────────────────────────────────────────

export const fillPredictions = pgTable(
  "fill_prediction",
  {
    id: serial("id").primaryKey(),
    deviceId: uuid("device_id")
      .references(() => smartBins.id)
      .notNull(),
    predictedFillPercent: real("predicted_fill_percent").notNull(),
    timeToThresholdMinutes: real("time_to_threshold_minutes"),
    confidenceScore: real("confidence_score"),
    modelVersion: varchar("model_version", { length: 50 }),
    predictedAt: timestamp("predicted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_prediction_device").on(table.deviceId),
    index("idx_prediction_time").on(table.predictedAt),
  ]
);

// ─── 6. Alerts ────────────────────────────────────────────────────────────────

export const alerts = pgTable(
  "alert",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subdivisionId: uuid("subdivision_id").references(() => subdivisions.id),
    deviceId: uuid("device_id").references(() => smartBins.id),
    alertType: alertTypeEnum("alert_type").notNull(),
    severity: alertSeverityEnum("severity").notNull().default("medium"),
    message: text("message"),
    isAcknowledged: boolean("is_acknowledged").default(false).notNull(),
    acknowledgedBy: uuid("acknowledged_by").references(() => users.id),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_alert_subdivision").on(table.subdivisionId),
    index("idx_alert_type").on(table.alertType),
    index("idx_alert_acknowledged").on(table.isAcknowledged),
  ]
);

// ─── 7. Collection Routes ─────────────────────────────────────────────────────

export const collectionRoutes = pgTable(
  "collection_route",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subdivisionId: uuid("subdivision_id")
      .references(() => subdivisions.id)
      .notNull(),
    status: routeStatusEnum("status").notNull().default("planned"),
    optimizationScore: real("optimization_score"),
    estimatedDistanceKm: real("estimated_distance_km"),
    estimatedDurationMinutes: real("estimated_duration_minutes"),
    assignedDriverId: uuid("assigned_driver_id").references(() => users.id),
    assignedVehicleId: varchar("assigned_vehicle_id", { length: 100 }),
    scheduledDate: timestamp("scheduled_date", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    routeGeojson: text("route_geojson"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_route_subdivision").on(table.subdivisionId),
    index("idx_route_status").on(table.status),
    index("idx_route_driver").on(table.assignedDriverId),
    index("idx_route_scheduled").on(table.scheduledDate),
  ]
);

// ─── 8. Route Stops ───────────────────────────────────────────────────────────

export const routeStops = pgTable(
  "route_stop",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    routeId: uuid("route_id")
      .references(() => collectionRoutes.id, { onDelete: "cascade" })
      .notNull(),
    deviceId: uuid("device_id")
      .references(() => smartBins.id)
      .notNull(),
    sequenceOrder: integer("sequence_order").notNull(),
    status: stopStatusEnum("status").notNull().default("pending"),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    servicedAt: timestamp("serviced_at", { withTimezone: true }),
    photoProofUrl: text("photo_proof_url"),
    notes: text("notes"),
  },
  (table) => [
    index("idx_stop_route").on(table.routeId),
    index("idx_stop_sequence").on(table.routeId, table.sequenceOrder),
  ]
);

// ─── 9. Service Events (Proof of Service) ─────────────────────────────────────

export const serviceEvents = pgTable(
  "service_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .references(() => smartBins.id)
      .notNull(),
    driverId: uuid("driver_id")
      .references(() => users.id)
      .notNull(),
    routeId: uuid("route_id").references(() => collectionRoutes.id),
    eventType: varchar("event_type", { length: 50 }).notNull(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    evidenceUrl: text("evidence_url"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_service_device").on(table.deviceId),
    index("idx_service_driver").on(table.driverId),
    index("idx_service_route").on(table.routeId),
  ]
);

// ─── 10. Audit Log ────────────────────────────────────────────────────────────

export const auditLogs = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").references(() => users.id),
    entityId: uuid("entity_id"),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    action: varchar("action", { length: 50 }).notNull(),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    ipAddress: varchar("ip_address", { length: 45 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_audit_user").on(table.userId),
    index("idx_audit_entity").on(table.entityType, table.entityId),
    index("idx_audit_created").on(table.createdAt),
  ]
);

// ─── 11. Notifications ────────────────────────────────────────────────────────

export const notifications = pgTable(
  "notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    channel: notificationChannelEnum("channel").notNull().default("in_app"),
    title: varchar("title", { length: 255 }),
    body: text("body").notNull(),
    isRead: boolean("is_read").default(false).notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_notification_user").on(table.userId),
    index("idx_notification_read").on(table.userId, table.isRead),
  ]
);

// ─── 12. Cached AI Insights ──────────────────────────────────────────────────

export const cachedInsights = pgTable(
  "cached_insight",
  {
    id: serial("id").primaryKey(),
    subdivisionId: uuid("subdivision_id").references(() => subdivisions.id),
    insightType: varchar("insight_type", { length: 50 }).notNull(),
    insight: text("insight").notNull(),
    provider: varchar("provider", { length: 50 }).notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_cached_insight_type").on(table.insightType),
    index("idx_cached_insight_subdivision").on(
      table.subdivisionId,
      table.insightType
    ),
  ]
);

// ─── 13. System Config ────────────────────────────────────────────────────────

export const systemConfig = pgTable(
  "system_config",
  {
    id: serial("id").primaryKey(),
    subdivisionId: uuid("subdivision_id").references(() => subdivisions.id),
    configKey: varchar("config_key", { length: 255 }).notNull(),
    configValue: text("config_value").notNull(),
    description: text("description"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("idx_config_key").on(table.configKey),
    index("idx_config_subdivision").on(table.subdivisionId, table.configKey),
  ]
);

// ─── 14. Feedback ────────────────────────────────────────────────────────────

export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id).notNull(),
    subdivisionId: uuid("subdivision_id").references(() => subdivisions.id),
    category: varchar("category", { length: 50 }).notNull(),
    message: text("message").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    adminReply: text("admin_reply"),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_feedback_user").on(table.userId),
    index("idx_feedback_status").on(table.status),
  ]
);

// ─── 15. FAQs ────────────────────────────────────────────────────────────────

export const faqs = pgTable(
  "faq",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subdivisionId: uuid("subdivision_id").references(() => subdivisions.id),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    category: varchar("category", { length: 50 }).default("general"),
    sortOrder: integer("sort_order").default(0),
    isPublished: boolean("is_published").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_faq_category").on(table.category),
    index("idx_faq_published").on(table.isPublished),
  ]
);

// ─── 16. Shift Schedules ─────────────────────────────────────────────────────

export const shiftSchedules = pgTable(
  "shift_schedule",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id).notNull(),
    subdivisionId: uuid("subdivision_id").references(() => subdivisions.id).notNull(),
    dayOfWeek: integer("day_of_week").notNull(), // 0=Sunday, 1=Monday, ..., 6=Saturday
    startTime: varchar("start_time", { length: 5 }).notNull(), // "07:00" format
    endTime: varchar("end_time", { length: 5 }).notNull(), // "15:00" format
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_shift_user").on(table.userId),
    index("idx_shift_day").on(table.dayOfWeek),
    index("idx_shift_subdivision").on(table.subdivisionId),
  ]
);

// ─── Relations ────────────────────────────────────────────────────────────────

export const subdivisionsRelations = relations(subdivisions, ({ many }) => ({
  users: many(users),
  smartBins: many(smartBins),
  alerts: many(alerts),
  collectionRoutes: many(collectionRoutes),
  systemConfigs: many(systemConfig),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  subdivision: one(subdivisions, {
    fields: [users.subdivisionId],
    references: [subdivisions.id],
  }),
  assignedRoutes: many(collectionRoutes),
  serviceEvents: many(serviceEvents),
  notifications: many(notifications),
  auditLogs: many(auditLogs),
}));

export const smartBinsRelations = relations(smartBins, ({ one, many }) => ({
  subdivision: one(subdivisions, {
    fields: [smartBins.subdivisionId],
    references: [subdivisions.id],
  }),
  telemetry: many(binTelemetry),
  predictions: many(fillPredictions),
  alerts: many(alerts),
  routeStops: many(routeStops),
  serviceEvents: many(serviceEvents),
}));

export const binTelemetryRelations = relations(binTelemetry, ({ one }) => ({
  device: one(smartBins, {
    fields: [binTelemetry.deviceId],
    references: [smartBins.id],
  }),
}));

export const fillPredictionsRelations = relations(
  fillPredictions,
  ({ one }) => ({
    device: one(smartBins, {
      fields: [fillPredictions.deviceId],
      references: [smartBins.id],
    }),
  })
);

export const alertsRelations = relations(alerts, ({ one }) => ({
  subdivision: one(subdivisions, {
    fields: [alerts.subdivisionId],
    references: [subdivisions.id],
  }),
  device: one(smartBins, {
    fields: [alerts.deviceId],
    references: [smartBins.id],
  }),
  acknowledgedByUser: one(users, {
    fields: [alerts.acknowledgedBy],
    references: [users.id],
  }),
}));

export const collectionRoutesRelations = relations(
  collectionRoutes,
  ({ one, many }) => ({
    subdivision: one(subdivisions, {
      fields: [collectionRoutes.subdivisionId],
      references: [subdivisions.id],
    }),
    assignedDriver: one(users, {
      fields: [collectionRoutes.assignedDriverId],
      references: [users.id],
    }),
    stops: many(routeStops),
    serviceEvents: many(serviceEvents),
  })
);

export const routeStopsRelations = relations(routeStops, ({ one }) => ({
  route: one(collectionRoutes, {
    fields: [routeStops.routeId],
    references: [collectionRoutes.id],
  }),
  device: one(smartBins, {
    fields: [routeStops.deviceId],
    references: [smartBins.id],
  }),
}));

export const serviceEventsRelations = relations(serviceEvents, ({ one }) => ({
  device: one(smartBins, {
    fields: [serviceEvents.deviceId],
    references: [smartBins.id],
  }),
  driver: one(users, {
    fields: [serviceEvents.driverId],
    references: [users.id],
  }),
  route: one(collectionRoutes, {
    fields: [serviceEvents.routeId],
    references: [collectionRoutes.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const systemConfigRelations = relations(systemConfig, ({ one }) => ({
  subdivision: one(subdivisions, {
    fields: [systemConfig.subdivisionId],
    references: [subdivisions.id],
  }),
}));

export const shiftSchedulesRelations = relations(shiftSchedules, ({ one }) => ({
  user: one(users, { fields: [shiftSchedules.userId], references: [users.id] }),
  subdivision: one(subdivisions, { fields: [shiftSchedules.subdivisionId], references: [subdivisions.id] }),
}));
