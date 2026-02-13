const modules = [
  'Tasks',
  'Budget & Cashflow',
  'Inventory',
  'Recurring Obligations'
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">LifeOS</h1>
      <p className="mt-4 text-lg text-slate-700">
        Multi-tenant household operations platform with shared governance and financial clarity.
      </p>
      <section className="mt-10 grid gap-4 md:grid-cols-2">
        {modules.map((moduleName) => (
          <article key={moduleName} className="rounded-2xl border border-slate-300 bg-white/70 p-5 shadow-sm">
            <h2 className="text-xl font-semibold">{moduleName}</h2>
            <p className="mt-2 text-sm text-slate-600">Module shell ready for CRUD, tags, filters, and audit trail wiring.</p>
          </article>
        ))}
      </section>
    </main>
  );
}
