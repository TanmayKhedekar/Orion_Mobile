import type { Metadata, Viewport } from 'next'
import { Space_Grotesk, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import { cn } from '@/lib/utils'
import { AuthProvider } from '@/context/AuthContext'
import PWARegister from './pwa-register'

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
                {/* PWA Manifest */}
                <link rel="manifest" href="/manifest.json" />

                {/* Theme */}
                <meta name="theme-color" content="#00d4ff" />
                <meta name="background-color" content="#0a0e1a" />

                {/* PWA iOS Support */}
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
                <meta name="apple-mobile-web-app-title" content="Orion" />
                <link rel="apple-touch-icon" href="/Orion.png" />
                <link rel="apple-touch-startup-image" href="/Orion.png" />

                {/* PWA Android Support */}
                <meta name="mobile-web-app-capable" content="yes" />
                <meta name="application-name" content="Orion" />

                {/* Microsoft Tiles */}
                <meta name="msapplication-TileColor" content="#0a0e1a" />
                <meta name="msapplication-TileImage" content="/Orion.png" />
                <meta name="msapplication-tap-highlight" content="no" />

                {/* General Mobile */}
                <meta name="format-detection" content="telephone=no" />
                <meta name="HandheldFriendly" content="true" />
            </head>
            <body className={cn(ibmPlexSans.className, "font-sans min-h-screen bg-background text-foreground antialiased selection:bg-accent selection:text-white")}>
                <AuthProvider>
                    {children}
                </AuthProvider>
                <PWARegister />
            </body>
        </html>
    )
}

