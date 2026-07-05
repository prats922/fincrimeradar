// api/subscribe.js
// Vercel serverless function, POST /api/subscribe.
// Merges the version already live in production, which correctly
// handles CORS, preflight, and Brevo duplicate contact errors, with
// proper email validation and a configurable list id, since the
// production version had the list id hardcoded rather than reading
// BREVO_LIST_ID, which meant that environment variable did nothing.
//
// Required environment variables, set in Vercel project settings:
//   BREVO_API_KEY   your Brevo account API key
//   BREVO_LIST_ID   numeric id of the list this signup adds contacts to

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://fincrimeradar.org');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.BREVO_API_KEY;
  const listId = process.env.BREVO_LIST_ID;

  if (!apiKey || !listId) {
    console.error('subscribe: BREVO_API_KEY or BREVO_LIST_ID not configured');
    return res.status(500).json({ error: 'Signup is temporarily unavailable' });
  }

  const rawEmail = req.body && req.body.email ? String(req.body.email) : '';
  const email = rawEmail.trim().toLowerCase();

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address' });
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({
        email,
        listIds: [Number(listId)],
        updateEnabled: true,
      }),
    });

    if (response.ok || response.status === 204) {
      return res.status(200).json({ success: true });
    }

    const data = await response.json().catch(() => ({}));

    if (data.code === 'duplicate_parameter') {
      return res.status(200).json({ success: true, duplicate: true });
    }

    console.error('subscribe: Brevo error', response.status, JSON.stringify(data));
    return res.status(400).json({ error: 'Signup failed' });
  } catch (err) {
    console.error('subscribe: network or unexpected error', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
