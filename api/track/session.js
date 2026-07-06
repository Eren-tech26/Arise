const clientPromise = require('../../lib/mongodb');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, event } = req.body;
    if (!username || !event) {
      return res.status(400).json({ error: 'Username and event are required' });
    }

    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'solo_leveling_system');
    const sessions = db.collection('sessions');

    await sessions.insertOne({
      username: username.trim().toLowerCase(),
      event,
      timestamp: new Date()
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to log session' });
  }
};
