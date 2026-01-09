export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Tesla Price Watcher</h1>
      <p>Monitoring Tesla inventory for price changes every 30 minutes.</p>
      <h2>Status</h2>
      <p>
        The watcher runs automatically via Vercel Cron.
        <br />
        Check your Telegram for notifications.
      </p>
      <h2>Manual Trigger</h2>
      <p>
        <code>GET /api/cron</code> - Trigger a price check manually
      </p>
    </main>
  );
}
