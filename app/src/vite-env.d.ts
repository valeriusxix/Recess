/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOLANA_CLUSTER?: string;
  readonly VITE_PYTH_API_KEY?: string;
}

interface Window {
  Buffer: typeof import("buffer").Buffer;
}
