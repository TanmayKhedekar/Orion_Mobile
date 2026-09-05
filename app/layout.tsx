import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import { cn } from '@/lib/utils'
import { AuthProvider } from '@/context/AuthContext'

const spaceGrotesk = Space_Grotesk({
    subsets: ['latin'],
    variable: '--font-display',
    display: 'swap',
})

const ibmPlexSans = IBM_Plex_Sans({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700'],
    variable: '--font-sans',
    display: 'swap',
})

const ibmPlexMono = IBM_Plex_Mono({
    subsets: ['latin'],
    variable: '--font-mono',
    weight: ['400', '500', '600', '700'],
    display: 'swap',
})

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: 'cover',
    themeColor: [
        { media: '(prefers-color-scheme: light)', color: '#F6F1E7' },
        { media: '(prefers-color-scheme: dark)', color: '#0B1120' },
    ],
}

export const metadata: Metadata = {
    title: 'Orion - API Intelligence Layer',
    description: 'Parse, explore, test, audit and generate SDKs from any API instantly',
    icons: {
        icon: '/Orion.png',
        shortcut: '/Orion.png',
        apple: '/Orion.png',
    }
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en" className={`${spaceGrotesk.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable}`}>
            <head>
                <link rel="icon" href="/Orion.png" />
            </head>
            <body className={cn(ibmPlexSans.className, "font-sans min-h-screen bg-background text-foreground antialiased selection:bg-accent selection:text-white")}>
                <AuthProvider>
                    {children}
                </AuthProvider>
            </body>
        </html>
    )
}

