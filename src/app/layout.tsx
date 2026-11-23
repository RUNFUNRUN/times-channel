import type { Metadata } from 'next';
import Script from 'next/script';
import { Providers } from '@/components/providers';
import { APPEARANCE_SCRIPT } from '@/lib/appearance';
import './globals.css';

export const metadata: Metadata = {
  title: 'times',
  description: '社内用の times チャンネルアプリ',
  robots: { index: false, follow: false },
};

const Layout = ({ children }: LayoutProps<'/'>) => {
  return (
    <html lang='ja' className='h-full antialiased' suppressHydrationWarning>
      <body className='h-full'>
        <Providers>{children}</Providers>
        <Script id='times-appearance' strategy='beforeInteractive'>
          {APPEARANCE_SCRIPT}
        </Script>
      </body>
    </html>
  );
};

export default Layout;
