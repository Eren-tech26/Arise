const clientPromise = require('../../lib/mongodb');
const verifyAdmin = require('../../lib/verifyAdmin');

module.exports = async (req, res) => {
  if (!verifyAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, username, updates } = req.body;
    if (!action || !username) {
      return res.status(400).json({ error: 'Action and username are required' });
    }

    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'solo_leveling_system');
    const hunters = db.collection('hunters');
    const cleanUsername = username.trim().toLowerCase();

    if (action === 'delete') {
      await hunters.deleteOne({ username: cleanUsername });
      return res.status(200).json({ success: true, action: 'deleted' });
    }

    if (action === 'suspend') {
      await hunters.updateOne({ username: cleanUsername }, { $set: { suspended: true } });
      return res.status(200).json({ success: true, action: 'suspended' });
    }

    if (action === 'unsuspend') {
      await hunters.updateOne({ username: cleanUsername }, { $set: { suspended: false } });
      return res.status(200).json({ success: true, action: 'unsuspended' });
    }

    if (action === 'edit') {
      if (!updates || typeof updates !== 'object') {
        return res.status(400).json({ error: 'Updates object is required for edit' });
      }

      const allowedFields = ['level', 'xp', 'xpToNextLevel', 'rank', 'statPoints', 'streak', 'totalXpEarned'];
      const setObj = {};

      for (const key of allowedFields) {
        if (updates[key] !== undefined) {
          setObj[key] = updates[key];
        }
      }

      if (updates.stats && typeof updates.stats === 'object') {
        for (const [stat, val] of Object.entries(updates.stats)) {
          setObj[`stats.${stat}`] = val;
        }
      }

      await hunters.updateOne({ username: cleanUsername }, { $set: setObj });
      return res.status(200).json({ success: true, action: 'edited' });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to manage hunter' });
  }
};
