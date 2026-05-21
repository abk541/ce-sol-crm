/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** SAM.gov Opportunities API key — register free at https://open.gsa.gov/api/get-started/ */
  readonly VITE_SAM_GOV_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
