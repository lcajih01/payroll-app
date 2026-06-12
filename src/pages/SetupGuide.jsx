export default function SetupGuide() {
  return (
    <div className="mx-auto grid min-h-dvh max-w-md place-items-center p-6">
      <div className="anim-pop w-full rounded-3xl border border-line bg-card p-7">
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-accent text-xl font-black text-white">₱</div>
        <h1 className="text-lg font-bold">Payroll Manager needs Supabase</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink2">
          No Supabase credentials were found. To connect your database:
        </p>
        <ol className="mt-4 space-y-3 text-sm leading-relaxed text-ink2">
          <li className="flex gap-3"><Step n={1} />Create a free project at <span className="text-ink">supabase.com</span></li>
          <li className="flex gap-3"><Step n={2} />Run <code className="rounded bg-card2 px-1.5 py-0.5 text-xs text-accent">supabase/migrations/0001_init.sql</code> in the SQL Editor (and optionally <code className="rounded bg-card2 px-1.5 py-0.5 text-xs text-accent">seed.sql</code>)</li>
          <li className="flex gap-3"><Step n={3} />Copy <code className="rounded bg-card2 px-1.5 py-0.5 text-xs text-accent">.env.example</code> to <code className="rounded bg-card2 px-1.5 py-0.5 text-xs text-accent">.env</code> and fill in your Project URL and <span className="text-ink">anon</span> key</li>
          <li className="flex gap-3"><Step n={4} />Restart the dev server or rebuild</li>
        </ol>
        <p className="mt-5 rounded-xl bg-card2 p-3 text-xs leading-relaxed text-ink3">
          Use the <span className="text-ink2">anon</span> public key only — never the service role key. Full steps are in the README.
        </p>
      </div>
    </div>
  )
}

function Step({ n }) {
  return (
    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-dim text-[11px] font-bold text-accent">
      {n}
    </span>
  )
}
