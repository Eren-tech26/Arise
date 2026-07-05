const clientPromise = require('../../lib/mongodb');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, questText, xpReward, statType } = req.body;

    if (!name || !questText) {
      return res.status(400).json({ error: 'Hunter name and quest text are required' });
    }

    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'solo_leveling_system');
    const hunters = db.collection('hunters');

    const quest = {
      id: new Date().getTime().toString(),
      text: questText.trim(),
      xpReward: xpReward || 20,
      statType: statType || 'STR',
      completed: false,
      createdAt: new Date(),
      dateKey: new Date().toISOString().split('T')[0]
    };

    const result = await hunters.updateOne(
      { name: name.trim() },
      { $push: { quests: quest }, $set: { lastActive: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Hunter not found' });
    }

    return res.status(201).json({ quest });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to add quest' });
  }
};
