declare namespace NodeJS {
  interface ProcessEnv {
    readonly NEXT_PUBLIC_SUPABASE_URL: string;
    readonly NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
    readonly SUPABASE_SERVICE_ROLE_KEY: string;
    readonly ANTHROPIC_API_KEY?: string;
    readonly RESEND_API_KEY?: string;
    readonly DIGEST_EMAIL?: string;
    readonly DIGEST_FROM?: string;
    readonly CRON_SECRET?: string;
    readonly NODE_ENV: "development" | "production" | "test";
    readonly [key: string]: string | undefined;
  }
}
