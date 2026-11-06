import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { startAppUpdates } from './pwa'
import './index.css'

startAppUpdates()

// Meminta browser agar tidak menghapus data lokal saat ruang penyimpanan menipis.
navigator.storage?.persist?.().catch(() => undefined)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
