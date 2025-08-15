import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Bellman Kalaba',
  description: 'RO project M1 GB',
  generator: 'Ryand and Kazz',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
