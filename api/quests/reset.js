const clientPromise = require('../../lib/mongodb');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Hunter name is required' });
    }

    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'solo_leveling_system');
    const hunters = db.collection('hunters');

    const hunter = await hunters.findOne({ name: name.trim() });
    if (!hunter) {
      return res.status(404).json({ error: 'Hunter not found' });
    }

    const today = new Date().toISOString().split('T')[0];
    const missedQuests = hunter.quests.filter(q => q.dateKey !== today && !q.completed);
    const penalty = missedQuests.length * 5;

    const remainingQuests = hunter.quests.filter(q => q.dateKey === today);
    const newXp = Math.max(0, hunter.xp - penalty);

    await hunters.updateOne(
      { name: name.trim() },
      {
        $set: {
          quests: remainingQuests,
          xp: newXp,
          lastActive: new Date()
        }
      }
    );

    return res.status(200).json({
      penaltyApplied: penalty,
      missedCount: missedQuests.length
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to reset quests' });
  }
};
