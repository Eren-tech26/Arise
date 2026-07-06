const clientPromise = require('../../lib/mongodb');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, page, tab } = req.body;

    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'solo_leveling_system');
    const visits = db.collection('visits');

    const entry = {
      username: username ? username.trim().toLowerCase() : null,
      page: page || 'unknown',
      tab: tab || null,
      timestamp: new Date(),
      dateKey: new Date().toISOString().split('T')[0]
    };

    await visits.insertOne(entry);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to log visit' });
  }
};
