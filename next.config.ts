import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 关掉左下角的开发工具浮标。它只在开发模式注入，但会压在界面左下角，
  // 演示时容易被当成产品的一部分；它也没有做多语言，改不了语言。
  devIndicators: false,
};

export default nextConfig;
