export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="rounded-3xl border border-slate-200 bg-white px-8 py-10 text-center shadow-sm">
        <h1 className="font-display text-2xl font-semibold text-slate-950">页面不存在</h1>
        <p className="mt-3 text-sm text-slate-500">请返回首页继续使用 Jeeves。</p>
      </div>
    </main>
  );
}
