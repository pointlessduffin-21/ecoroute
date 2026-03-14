import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  tablesFilter: ["!spatial_ref_sys", "!geography_columns", "!geometry_columns", "!raster_columns", "!raster_overviews"],
  extensionsFilters: ["postgis"],
} satisfies Config;
