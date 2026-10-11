import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '科研数据质量治理 Agent',
  description: '把数据清洗变成一份可复现、可追溯的处理记录',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        {children}
      </body>
    </html>
  );
}
