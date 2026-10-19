import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GitHub 热报",
  description: "发现 GitHub Trending 上正在增长的开源仓库"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
