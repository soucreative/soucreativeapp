import type { Metadata } from 'next'
import { Lexend_Deca } from 'next/font/google'
import localFont from 'next/font/local'
import './globals.css'

const lexend = Lexend_Deca({ subsets: ['latin'], variable: '--font-lexend' })
const spalla = localFont({ src: './fonts/spallablack.otf', variable: '--font-spalla' })

export const metadata: Metadata = {
  title: 'SOU Creative',
  description: 'Produção, pessoas e gestão da SOU Creative',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT" className={`${lexend.variable} ${spalla.variable} h-full antialiased`}>
      <body className="h-full font-sans" suppressHydrationWarning>{children}</body>
    </html>
  )
}
