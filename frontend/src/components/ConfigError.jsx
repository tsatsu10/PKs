/** Shown instead of the app when the build is missing its Supabase settings (R13). */
export default function ConfigError({ missing }) {
  return (
    <main
      role="alert"
      style={{ maxWidth: '36rem', margin: '4rem auto', padding: '0 1rem', fontFamily: 'var(--pks-font-sans, system-ui, sans-serif)', color: 'var(--color-text, inherit)' }}
    >
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>PKS isn&apos;t configured</h1>
      <p>These settings are empty in this build:</p>
      <ul>
        {missing.map((name) => <li key={name}><code>{name}</code></li>)}
      </ul>
      <p>Set them in <code>frontend/.env</code> or the hosting settings, then rebuild.</p>
    </main>
  );
}
