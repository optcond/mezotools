/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MEZO_PROVIDER_URL?: string;
  readonly VITE_SEED_PHRASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
