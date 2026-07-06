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
    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'solo_leveling_system');
    const hunters = db.collection('hunters');

    const allHunters = await hunters
      .find({}, { projection: { passwordHash: 0 } })
      .sort({ lastActive: -1 })
      .toArray();

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const summary = allHunters.map(h => ({
      _id: h._id,
      username: h.username,
      displayName: h.displayName,
      rank: h.rank,
      level: h.level,
      xp: h.xp,
      totalXpEarned: h.totalXpEarned,
      streak: h.streak,
      statPoints: h.statPoints,
      dailyQuestCount: (h.dailyQuests || []).length,
      weeklyQuestCount: (h.weeklyQuests || []).length,
      achievementCount: (h.achievements || []).length,
      questsCompletedTotal: (h.questHistory || []).length,
      suspended: h.suspended || false,
      createdAt: h.createdAt,
      lastActive: h.lastActive,
      isInactive: new Date(h.lastActive) < sevenDaysAgo
    }));

    return res.status(200).json({ hunters: summary });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch hunters' });
  }
};
