import axios from 'axios'

// Same-origin in prod (FastAPI serves the built SPA); Vite proxies /api in dev.
export const api = axios.create({ baseURL: '/api' })

// Small helpers
export const fmtInt = (n) => (n == null ? '—' : Number(n).toLocaleString('ru-RU'))
export const fmtTenge = (n) =>
  n == null ? '—' : '₸' + Number(n).toLocaleString('ru-RU', { maximumFractionDigits: 0 })
export const fmtPct = (n, d = 1) => (n == null ? '—' : Number(n).toFixed(d) + '%')

export default api
