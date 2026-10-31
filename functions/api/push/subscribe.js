// Cloudflare Pages Function: /api/push/subscribe
// Authenticated push subscriptions are stored directly in Firestore (/pushSubscriptions/{subId}).
// This endpoint acknowledges browser push subscription registration cleanly on Cloudflare Pages.
export async function onRequestPost() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
