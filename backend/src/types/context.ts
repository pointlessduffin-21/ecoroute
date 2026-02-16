import type { Context } from "hono";

export interface AppUser {
  id: string;
  email: string;
  fullName: string;
  role: "admin" | "dispatcher" | "driver";
  subdivisionId: string | null;
}

export type AppVariables = {
  user: AppUser;
};

/**
 * Typed Hono context with EcoRoute app variables.
 */
export type AppContext = Context<{ Variables: AppVariables }>;
