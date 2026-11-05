import { createClient } from '@supabase/supabase-js'

const URL_SUPABASE = import.meta.env.VITE_SUPABASE_URL

// En producción el CRM no habla directamente con *.supabase.co sino con /sb de su propia web
// (crm-iaeste.vercel.app/sb/…), que Vercel reenvía a Supabase (ver vercel.json). Así funciona
// también en redes que bloquean supabase.co (filtros como OpenDNS, wifis de universidades…).
// En local (npm run dev) se usa Supabase directamente.
const url = import.meta.env.PROD ? `${window.location.origin}/sb` : URL_SUPABASE

export const supabase = createClient(url, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  auth: {
    // Misma clave de sesión que cuando se usaba la URL de Supabase: nadie pierde la sesión con el cambio
    storageKey: `sb-${new URL(URL_SUPABASE).hostname.split('.')[0]}-auth-token`,
  },
})