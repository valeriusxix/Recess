import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'
import { recessProxyPlugin } from './server/binanceProxy.mjs'

function securityHeadersPlugin() {
  const apply = (server) => {
    server.middlewares.use((_req, res, next) => {
      res.setHeader('X-Frame-Options', 'DENY')
      res.setHeader('Content-Security-Policy', "frame-ancestors 'none'")
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
      next()
    })
  }
  return {
    name: 'recess-security-headers',
    configureServer: apply,
    configurePreviewServer: apply,
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    securityHeadersPlugin(),
    recessProxyPlugin(),
  ],
})
