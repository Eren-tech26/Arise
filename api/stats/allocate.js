const clientPromise = require('../../lib/mongodb');

const VALID_STATS = ['STR', 'AGI', 'VIT', 'INT', 'SENSE'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, stat, points } = req.body;

    if (!username || !VALID_STATS.includes(stat) || !points || points < 1) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'solo_leveling_system');
    const hunters = db.collection('hunters');

    const cleanUsername = username.trim().toLowerCase();
    const hunter = await hunters.findOne({ username: cleanUsername });
    if (!hunter) {
      return res.status(404).json({ error: 'Hunter not found' });
    }

    if (hunter.statPoints < points) {
      return res.status(400).json({ error: 'Not enough stat points' });
    }

    const statField = `stats.${stat}`;

    await hunters.updateOne(
      { username: cleanUsername },
      {
        $inc: { [statField]: points, statPoints: -points },
        $set: { lastActive: new Date() }
      }
    );

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to allocate stat point' });
  }
};
