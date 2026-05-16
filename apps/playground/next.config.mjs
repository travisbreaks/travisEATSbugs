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
  // Static export: the playground has no SSR / API needs (all interactivity
  // is client-side widget code). Built output is copied into
  // travismakes-org/travis-eats-bugs/playground/ so it serves under
  // https://travismakes.org/travis-eats-bugs/playground/ via Netlify.
  output: 'export',
  trailingSlash: true,
  basePath: '/travis-eats-bugs/playground',
  assetPrefix: '/travis-eats-bugs/playground',
  images: { unoptimized: true },
}

export default nextConfig
