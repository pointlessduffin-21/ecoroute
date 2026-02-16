import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  SUPABASE_URL: z.string().optional().default(""),
  SUPABASE_ANON_KEY: z.string().optional().default(""),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(""),
  MQTT_BROKER_URL: z.string().default("mqtt://localhost:1883"),
  MQTT_USERNAME: z.string().default("ecoroute"),
  MQTT_PASSWORD: z.string().default("secret"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  GOOGLE_MAPS_API_KEY: z.string().default(""),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  JWT_SECRET: z.string().default("dev-secret-change-in-production"),
  JWT_EXPIRES_IN: z.string().default("7d"),
});

export type Env = z.infer<typeof envSchema>;

let env: Env;

try {
  env = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    const missing = error.issues.map((i) => i.path.join(".")).join(", ");
    console.error(`Missing or invalid env vars: ${missing}`);
    console.error(
      "Copy .env.example to .env and fill in the required values."
    );
  }
  process.exit(1);
}

/** Whether Supabase is configured for auth. If false, uses local JWT. */
export const useSupabaseAuth =
  env.SUPABASE_URL.length > 0 &&
  env.SUPABASE_ANON_KEY.length > 0 &&
  env.SUPABASE_SERVICE_ROLE_KEY.length > 0;

export { env };
