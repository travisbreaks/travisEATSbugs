import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'travisEATSbugs Playground',
  description: 'Development playground for the travisEATSbugs widget.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          background: '#fafafa',
          color: '#1a1a1a',
        }}
      >
        {children}
      </body>
    </html>
  )
}
