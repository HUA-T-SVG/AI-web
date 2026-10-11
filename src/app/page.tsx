import { redirect } from 'next/navigation';

/** 根路径没有独立内容，直接进入数据导入 */
export default function HomePage() {
  redirect('/import');
}
