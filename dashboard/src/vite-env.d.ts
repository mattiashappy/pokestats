/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly ADMIN_EMAIL?: string
  readonly ADMIN_PASS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
