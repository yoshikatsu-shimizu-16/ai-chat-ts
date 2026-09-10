declare module "cloudflare:workers" {
  import type { D1Database } from "@cloudflare/workers-types";

  export const env: {
    DB: D1Database;
    OPENAI_API_KEY: string;
    OPENAI_API_MODEL?: string;
    OPENAI_API_TEMPERATURE?: string;
  };
}
