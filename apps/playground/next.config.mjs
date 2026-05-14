import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@travisbreaks/travisEATSbugs'],
  // Silence "multiple lockfiles detected" warning when the parent CODE
  // monorepo has its own package-lock.json.
  outputFileTracingRoot: resolve(__dirname, '../..'),
}

export default nextConfig
