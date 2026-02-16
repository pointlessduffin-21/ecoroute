CREATE TYPE "public"."alert_severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."alert_type" AS ENUM('overflow', 'low_battery', 'sensor_anomaly', 'offline');--> statement-breakpoint
CREATE TYPE "public"."bin_status" AS ENUM('active', 'inactive', 'maintenance', 'offline');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('push', 'sms', 'email', 'in_app');--> statement-breakpoint
CREATE TYPE "public"."route_status" AS ENUM('planned', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."stop_status" AS ENUM('pending', 'arrived', 'serviced', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'dispatcher', 'driver');--> statement-breakpoint
CREATE TABLE "alert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subdivision_id" uuid,
	"device_id" uuid,
	"alert_type" "alert_type" NOT NULL,
	"severity" "alert_severity" DEFAULT 'medium' NOT NULL,
	"message" text,
	"is_acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledged_by" uuid,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"entity_id" uuid,
	"entity_type" varchar(100) NOT NULL,
	"action" varchar(50) NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bin_telemetry" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_id" uuid NOT NULL,
	"fill_level_percent" real NOT NULL,
	"distance_cm" real,
	"battery_voltage" real,
	"signal_strength" integer,
	"anomaly_flag" boolean DEFAULT false NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_route" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subdivision_id" uuid NOT NULL,
	"status" "route_status" DEFAULT 'planned' NOT NULL,
	"optimization_score" real,
	"estimated_distance_km" real,
	"estimated_duration_minutes" real,
	"assigned_driver_id" uuid,
	"assigned_vehicle_id" varchar(100),
	"scheduled_date" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"route_geojson" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fill_prediction" (
	"id" serial PRIMARY KEY NOT NULL,
	"device_id" uuid NOT NULL,
	"predicted_fill_percent" real NOT NULL,
	"time_to_threshold_minutes" real,
	"confidence_score" real,
	"model_version" varchar(50),
	"predicted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel" "notification_channel" DEFAULT 'in_app' NOT NULL,
	"title" varchar(255),
	"body" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_stop" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"sequence_order" integer NOT NULL,
	"status" "stop_status" DEFAULT 'pending' NOT NULL,
	"arrived_at" timestamp with time zone,
	"serviced_at" timestamp with time zone,
	"photo_proof_url" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "service_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"route_id" uuid,
	"event_type" varchar(50) NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"evidence_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smart_bin" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subdivision_id" uuid NOT NULL,
	"device_code" varchar(100) NOT NULL,
	"imei" varchar(20),
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"capacity_liters" real DEFAULT 120 NOT NULL,
	"threshold_percent" real DEFAULT 80 NOT NULL,
	"status" "bin_status" DEFAULT 'active' NOT NULL,
	"install_date" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"firmware_version" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "smart_bin_device_code_unique" UNIQUE("device_code"),
	CONSTRAINT "smart_bin_imei_unique" UNIQUE("imei")
);
--> statement-breakpoint
CREATE TABLE "subdivision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(50) NOT NULL,
	"geofence" text,
	"address" text,
	"contact_email" varchar(255),
	"contact_phone" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subdivision_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "system_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"subdivision_id" uuid,
	"config_key" varchar(255) NOT NULL,
	"config_value" text NOT NULL,
	"description" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subdivision_id" uuid,
	"email" varchar(255) NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"role" "user_role" DEFAULT 'driver' NOT NULL,
	"phone" varchar(50),
	"avatar_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"supabase_uid" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_supabase_uid_unique" UNIQUE("supabase_uid")
);
--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_subdivision_id_subdivision_id_fk" FOREIGN KEY ("subdivision_id") REFERENCES "public"."subdivision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_device_id_smart_bin_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."smart_bin"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_acknowledged_by_user_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bin_telemetry" ADD CONSTRAINT "bin_telemetry_device_id_smart_bin_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."smart_bin"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_route" ADD CONSTRAINT "collection_route_subdivision_id_subdivision_id_fk" FOREIGN KEY ("subdivision_id") REFERENCES "public"."subdivision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_route" ADD CONSTRAINT "collection_route_assigned_driver_id_user_id_fk" FOREIGN KEY ("assigned_driver_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fill_prediction" ADD CONSTRAINT "fill_prediction_device_id_smart_bin_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."smart_bin"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stop" ADD CONSTRAINT "route_stop_route_id_collection_route_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."collection_route"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_stop" ADD CONSTRAINT "route_stop_device_id_smart_bin_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."smart_bin"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_event" ADD CONSTRAINT "service_event_device_id_smart_bin_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."smart_bin"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_event" ADD CONSTRAINT "service_event_driver_id_user_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_event" ADD CONSTRAINT "service_event_route_id_collection_route_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."collection_route"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_bin" ADD CONSTRAINT "smart_bin_subdivision_id_subdivision_id_fk" FOREIGN KEY ("subdivision_id") REFERENCES "public"."subdivision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_config" ADD CONSTRAINT "system_config_subdivision_id_subdivision_id_fk" FOREIGN KEY ("subdivision_id") REFERENCES "public"."subdivision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_subdivision_id_subdivision_id_fk" FOREIGN KEY ("subdivision_id") REFERENCES "public"."subdivision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_alert_subdivision" ON "alert" USING btree ("subdivision_id");--> statement-breakpoint
CREATE INDEX "idx_alert_type" ON "alert" USING btree ("alert_type");--> statement-breakpoint
CREATE INDEX "idx_alert_acknowledged" ON "alert" USING btree ("is_acknowledged");--> statement-breakpoint
CREATE INDEX "idx_audit_user" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_entity" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_created" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_telemetry_device" ON "bin_telemetry" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "idx_telemetry_recorded_at" ON "bin_telemetry" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX "idx_telemetry_device_time" ON "bin_telemetry" USING btree ("device_id","recorded_at");--> statement-breakpoint
CREATE INDEX "idx_route_subdivision" ON "collection_route" USING btree ("subdivision_id");--> statement-breakpoint
CREATE INDEX "idx_route_status" ON "collection_route" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_route_driver" ON "collection_route" USING btree ("assigned_driver_id");--> statement-breakpoint
CREATE INDEX "idx_route_scheduled" ON "collection_route" USING btree ("scheduled_date");--> statement-breakpoint
CREATE INDEX "idx_prediction_device" ON "fill_prediction" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "idx_prediction_time" ON "fill_prediction" USING btree ("predicted_at");--> statement-breakpoint
CREATE INDEX "idx_notification_user" ON "notification" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_notification_read" ON "notification" USING btree ("user_id","is_read");--> statement-breakpoint
CREATE INDEX "idx_stop_route" ON "route_stop" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "idx_stop_sequence" ON "route_stop" USING btree ("route_id","sequence_order");--> statement-breakpoint
CREATE INDEX "idx_service_device" ON "service_event" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "idx_service_driver" ON "service_event" USING btree ("driver_id");--> statement-breakpoint
CREATE INDEX "idx_service_route" ON "service_event" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "idx_bin_subdivision" ON "smart_bin" USING btree ("subdivision_id");--> statement-breakpoint
CREATE INDEX "idx_bin_device_code" ON "smart_bin" USING btree ("device_code");--> statement-breakpoint
CREATE INDEX "idx_bin_status" ON "smart_bin" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_subdivision_code" ON "subdivision" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_config_key" ON "system_config" USING btree ("config_key");--> statement-breakpoint
CREATE INDEX "idx_config_subdivision" ON "system_config" USING btree ("subdivision_id","config_key");--> statement-breakpoint
CREATE INDEX "idx_user_email" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_user_subdivision" ON "user" USING btree ("subdivision_id");--> statement-breakpoint
CREATE INDEX "idx_user_role" ON "user" USING btree ("role");