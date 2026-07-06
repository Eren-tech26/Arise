const clientPromise = require('../../lib/mongodb');
const verifyAdmin = require('../../lib/verifyAdmin');

module.exports = async (req, res) => {
  if (!verifyAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username } = req.query;
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'solo_leveling_system');
    const hunters = db.collection('hunters');
    const sessions = db.collection('sessions');
    const visits = db.collection('visits');

    const cleanUsername = username.trim().toLowerCase();

    const hunter = await hunters.findOne({ username: cleanUsername }, { projection: { passwordHash: 0 } });
    if (!hunter) {
      return res.status(404).json({ error: 'Hunter not found' });
    }

    const sessionLog = await sessions.find({ username: cleanUsername }).sort({ timestamp: -1 }).limit(50).toArray();
    const visitLog = await visits.find({ username: cleanUsername }).sort({ timestamp: -1 }).limit(100).toArray();

    return res.status(200).json({ hunter, sessionLog, visitLog });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch hunter detail' });
  }
};
