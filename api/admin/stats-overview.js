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
    const visits = db.collection('visits');
    const hunters = db.collection('hunters');

    const totalVisits = await visits.countDocuments();

    const last14Days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last14Days.push(d.toISOString().split('T')[0]);
    }

    const dailyVisitCounts = await Promise.all(
      last14Days.map(async (dateKey) => ({
        date: dateKey,
        count: await visits.countDocuments({ dateKey })
      }))
    );

    const totalHunters = await hunters.countDocuments();

    const leaderboard = await hunters
      .find({}, { projection: { username: 1, displayName: 1, level: 1, rank: 1, totalXpEarned: 1, streak: 1 } })
      .sort({ totalXpEarned: -1 })
      .limit(20)
      .toArray();

    return res.status(200).json({
      totalVisits,
      totalHunters,
      dailyVisitCounts,
      leaderboard
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch stats overview' });
  }
};
