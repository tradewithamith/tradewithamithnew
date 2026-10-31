// Cloudflare Pages Function: /api/push/vapid-public-key
// Returns VAPID_PUBLIC_KEY if set in Cloudflare env; otherwise client reads /pushPublic/vapid from Firestore.
export async function onRequestGet(context) {
  const pubKey = (context.env && context.env.VAPID_PUBLIC_KEY) || '';
  return new Response(JSON.stringify({ publicKey: pubKey }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
