export default function Home() {
  return (
    <main style={{ padding: "1.5rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>Webhook receiver</h1>
      <p>
        POST events to <code>/webhooks</code> with header{" "}
        <code>X-Signature</code> (v1 HMAC-SHA256). List stored events via{" "}
        <code>GET /webhooks</code>.
      </p>
    </main>
  );
}
