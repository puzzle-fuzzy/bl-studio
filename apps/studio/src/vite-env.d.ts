/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LEGAL_ENTITY?: string
  readonly VITE_LEGAL_CONTACT_EMAIL?: string
  readonly VITE_LEGAL_EFFECTIVE_DATE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
