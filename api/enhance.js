// Optional "Enhance scene": sends one edited photo to an image model and returns a restyled version.
// Needs OPENAI_API_KEY in the Vercel project settings. Without it the app simply says the feature is not switched on.
// Optional: OPENAI_IMAGE_MODEL (default gpt-image-1.5) and ENHANCE_TOKEN (an access code testers must enter, to protect spend).
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(501).json({ error: 'not_configured' });
  const need = process.env.ENHANCE_TOKEN;
  if (need && req.headers['x-pp-token'] !== need) return res.status(401).json({ error: 'token' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const m = /^data:image\/(jpeg|png);base64,(.+)$/.exec(body.image || '');
    if (!m) return res.status(400).json({ error: 'bad_image', message: 'Photo could not be read.' });
    const bytes = Buffer.from(m[2], 'base64');
    if (bytes.length > 3.5 * 1024 * 1024) return res.status(413).json({ error: 'too_big', message: 'Photo is too large.' });
    const biz = String(body.business || 'a small business').slice(0, 60);
    const prompt =
      'Keep the main subject exactly as it is in the photo: the same food, objects or people, with the same shapes, ingredients, colours and textures. ' +
      'Make it look like a professional photographer shot and edited it for ' + biz + ': natural warm light, rich true colour, ' +
      'gentle depth with a softly blurred, clean, tasteful background, and remove clutter around the subject. ' +
      'Realistic photograph, not an illustration. No text, logos, watermarks or borders.';
    const call = async (extra) => {
      const fd = new FormData();
      fd.append('model', process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5');
      fd.append('prompt', prompt);
      fd.append('size', '1024x1536');
      fd.append('quality', 'medium');
      fd.append('output_format', 'jpeg');
      fd.append('output_compression', '85');
      for (const [k, v] of Object.entries(extra)) fd.append(k, v);
      fd.append('image', new Blob([bytes], { type: 'image/' + m[1] }), 'photo.' + (m[1] === 'png' ? 'png' : 'jpg'));
      return fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: fd });
    };
    let r = await call({ input_fidelity: 'high' });
    if (r.status === 400) r = await call({}); // some models do not accept input_fidelity
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: 'upstream', message: (j.error && j.error.message) || 'The image service refused the request.' });
    const b64 = j.data && j.data[0] && j.data[0].b64_json;
    if (!b64) return res.status(502).json({ error: 'empty', message: 'The image service returned nothing.' });
    return res.status(200).json({ image: b64 });
  } catch (e) {
    return res.status(500).json({ error: 'server', message: 'Something went wrong. Try again.' });
  }
};
