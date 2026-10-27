/// <reference types="vitest/config" />
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  server: {
    // data/ and schemas/ live outside web/; the packages import them as JSON.
    fs: { allow: [resolve(import.meta.dirname, "../../..")] },
  },
  worker: { format: "es" },
  test: {
    include: ["test/**/*.test.ts"],
  },
});
