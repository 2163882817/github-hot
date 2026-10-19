export default function HomePage() {
  return (
    <main style={{ maxWidth: 760, margin: "12vh auto", padding: "0 24px", fontFamily: "system-ui, sans-serif" }}>
      <p style={{ color: "#176c51", fontWeight: 700 }}>GitHub 热报 · 阶段 0</p>
      <h1>工程骨架已就绪</h1>
      <p>真实榜单尚未接入。本阶段只验证 GitHub Trending 页面与数据契约，不展示模拟榜单。</p>
      <p>下一阶段将实现仓库元数据、持久化快照和榜单 API。</p>
    </main>
  );
}
