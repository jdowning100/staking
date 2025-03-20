import '@/public/styles/globals.css';

import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { Analytics } from '@vercel/analytics/react';
import localFont from 'next/font/local';
import { Suspense } from 'react';
import Providers from '@/lib/context/providers';
import { Toaster } from '@/components/ui/toaster';
import { Inter } from 'next/font/google';
import { StateProvider } from '../store';
import { APP_TITLE, APP_DESCRIPTION } from '@/lib/config';

const Header = dynamic(() => import('@/components/common/header'), {
  ssr: false,
  suspense: true,
});

const satoshiFont = localFont({
  src: [
    { path: '../fonts/Satoshi-Light.woff2', weight: '300' },
    { path: '../fonts/Satoshi-Regular.woff2', weight: '400' },
    { path: '../fonts/Satoshi-Medium.woff2', weight: '500' },
    { path: '../fonts/Satoshi-Bold.woff2', weight: '700' },
  ],
  variable: '--font-satoshi',
});

const monoramaFont = localFont({
  src: [
    { path: '../fonts/Monorama-Regular.woff2', weight: '400' },
    { path: '../fonts/Monorama-Regular.woff2', weight: '700' },
  ],
  variable: '--font-monorama',
});

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: APP_TITLE,
  description: APP_DESCRIPTION,
  metadataBase: new URL('https://nft.qu.ai'),
  openGraph: {
    images: '/opengraph-image.png',
  },
  twitter: {
    images: '/opengraph-image.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={cn(
          `bg-[#0C0C0C] text-white antialiased ${satoshiFont.variable} ${monoramaFont.variable} ${inter.className}`
        )}
      >
        <StateProvider>
          <Providers>
            <Suspense fallback={<div></div>}>
              <Header />
            </Suspense>
            <div className="relative">{children}</div>
            <Toaster />
            <Analytics />
          </Providers>
        </StateProvider>
      </body>
    </html>
  );
}
