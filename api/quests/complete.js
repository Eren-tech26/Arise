const clientPromise = require('../../lib/mongodb');

function calculateLevelUp(hunter) {
  let { level, xp, xpToNextLevel, statPoints } = hunter;

  while (xp >= xpToNextLevel) {
    xp -= xpToNextLevel;
    level += 1;
    statPoints += 3;
    xpToNextLevel = Math.floor(xpToNextLevel * 1.15);
  }

  return { level, xp, xpToNextLevel, statPoints };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name, questId } = req.body;

    if (!name || !questId) {
      return res.status(400).json({ error: 'Hunter name and quest ID are required' });
    }

    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'solo_leveling_system');
    const hunters = db.collection('hunters');

    const hunter = await hunters.findOne({ name: name.trim() });
    if (!hunter) {
      return res.status(404).json({ error: 'Hunter not found' });
    }

    const quest = hunter.quests.find(q => q.id === questId);
    if (!quest) {
      return res.status(404).json({ error: 'Quest not found' });
    }
    if (quest.completed) {
      return res.status(400).json({ error: 'Quest already completed' });
    }

    const leveledUpFrom = hunter.level;
    const newXp = hunter.xp + quest.xpReward;

    const updated = calculateLevelUp({
      level: hunter.level,
      xp: newXp,
      xpToNextLevel: hunter.xpToNextLevel,
      statPoints: hunter.statPoints
    });

    const leveledUp = updated.level > leveledUpFrom;

    await hunters.updateOne(
      { name: name.trim(), 'quests.id': questId },
      {
        $set: {
          'quests.$.completed': true,
          level: updated.level,
          xp: updated.xp,
          xpToNextLevel: updated.xpToNextLevel,
          statPoints: updated.statPoints,
          lastActive: new Date()
        }
      }
    );

    return res.status(200).json({
      xpGained: quest.xpReward,
      leveledUp,
      newLevel: updated.level,
      statPointsGained: leveledUp ? (updated.level - leveledUpFrom) * 3 : 0,
      hunter: { ...hunter, ...updated }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to complete quest' });
  }
};
