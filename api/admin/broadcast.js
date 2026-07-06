const clientPromise = require('../../lib/mongodb');
const verifyAdmin = require('../../lib/verifyAdmin');

module.exports = async (req, res) => {
  try {
    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'solo_leveling_system');
    const broadcasts = db.collection('broadcasts');

    if (req.method === 'POST') {
      if (!verifyAdmin(req)) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { message } = req.body;
      if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Message is required' });
      }

      const broadcast = { message: message.trim(), createdAt: new Date().toISOString() };
      await broadcasts.insertOne(broadcast);

      return res.status(201).json({ broadcast });
    }

    if (req.method === 'GET') {
      const latest = await broadcasts.find({}).sort({ createdAt: -1 }).limit(1).toArray();
      return res.status(200).json({ broadcast: latest[0] || null });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Broadcast failed' });
  }
};
