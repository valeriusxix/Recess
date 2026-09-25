import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const appDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    global: "globalThis",
    "process.env.ANCHOR_BROWSER": JSON.stringify("true"),
  },
  resolve: {
    alias: {
      buffer: "buffer",
      // The Pyth client imports Jito only for optional tips. That package pulls an
      // old web3.js which breaks the browser build. Live transactions do not tip.
      "jito-ts/dist/sdk/block-engine/types": path.join(appDir, "src/shims/jito-bundle.ts"),
    },
  },
  preview: {
    headers: {
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.devnet.solana.com wss://api.devnet.solana.com https://api.mainnet-beta.solana.com wss://api.mainnet-beta.solana.com https://hermes.pyth.network https://pyth.dourolabs.app; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    },
  },
});
