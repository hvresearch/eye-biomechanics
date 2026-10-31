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
  build: {
    // kB; the three chunk alone is about 740 kB minified (190 kB gzipped).
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        // Vendor chunks (the M0 "manual chunk for three" item; `codeSplitting` is Rolldown's
        // successor to Rollup's manualChunks): three, the react-three stack, and React change
        // on different schedules from the app and cache separately.
        codeSplitting: {
          groups: [
            { name: "three", test: /[\\/]node_modules[\\/]three[\\/]/, priority: 3 },
            { name: "r3f", test: /[\\/]node_modules[\\/](@react-three|three-stdlib|three-mesh-bvh|troika-[^\\/]+|camera-controls|maath|meshline|stats-gl|its-fine|suspend-react|zustand)[\\/]/, priority: 2 },
            { name: "react", test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
  },
});
