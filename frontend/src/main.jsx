import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Clear stale dev precaches if present
if (import.meta.env.DEV && typeof window !== 'undefined') {
  if ('caches' in window) {
    caches.keys().then((keys) => {
      keys.forEach((key) => {
        if (key.includes('workbox-precache') || key.includes('moneysuivi')) {
          caches.delete(key);
        }
      });
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
