import type { Metadata, Viewport } from 'next';
import './globals.css';
import AppShell from '@/components/app-shell';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const metadata: Metadata = {
  applicationName: '钟福供养办事处',
  title: '钟福供养办事处',
  description: '钟福生活管理中控台 - 采购、喂食、健康、支出一站式管理',
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [{ url: `${basePath}/zhongfu-cat-icon.png`, type: 'image/png', sizes: '512x512' }],
    shortcut: `${basePath}/zhongfu-cat-icon.png`,
    apple: [{ url: `${basePath}/zhongfu-cat-app-icon.png`, type: 'image/png', sizes: '512x512' }],
  },
  manifest: `${basePath}/manifest.json`,
  appleWebApp: {
    capable: true,
    title: '钟福供养办事处',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#B0E0E6',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
