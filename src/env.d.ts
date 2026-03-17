/// <reference types="@cloudflare/workers-types/2023-07-01" />

// Extend CloudflareEnv with project-specific D1 binding
// The base CloudflareEnv is declared by @opennextjs/cloudflare
declare global {
  interface CloudflareEnv {
    AUTH_DB: D1Database;
  }
}

export {};
