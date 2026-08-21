import type { Metadata } from 'next';
import './globals.css';
import AppShell from '@/components/app-shell';

export const metadata: Metadata = {
  title: '钟福供养办事处',
  description: '钟福生活管理中控台 - 采购、喂食、健康、支出一站式管理',
  icons: {
    icon: '/favicon.png',
    apple: '/favicon.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: '钟福供养办事处',
    statusBarStyle: 'default',
  },
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
