const clientPromise = require('../../lib/mongodb');
const verifyAdmin = require('../../lib/verifyAdmin');

module.exports = async (req, res) => {
  const { action } = req.query;

  try {
    // ---------- LOGIN (no verifyAdmin — this IS the login) ----------
    if (action === 'login') {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }
      const { password } = req.body;
      if (!password || password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Invalid admin password' });
      }
      const token = Buffer.from(`admin:${Date.now()}:${process.env.ADMIN_PASSWORD}`).toString('base64');
      return res.status(200).json({ token });
    }

    // ---------- Everything below requires admin auth ----------
    if (!verifyAdmin(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'solo_leveling_system');

    // ---------- HUNTERS (summary list) ----------
    if (action === 'hunters') {
      if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
      }
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
    }

    // ---------- HUNTER DETAIL ----------
    if (action === 'hunter-detail') {
      if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
      }
      const { username } = req.query;
      if (!username) {
        return res.status(400).json({ error: 'Username is required' });
      }
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
    }

    // ---------- BROADCAST ----------
    if (action === 'broadcast') {
      const broadcasts = db.collection('broadcasts');

      if (req.method === 'POST') {
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
    }

    // ---------- MANAGE HUNTER ----------
    if (action === 'manage-hunter') {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }
      const { action: subAction, username, updates } = req.body;
      if (!subAction || !username) {
        return res.status(400).json({ error: 'Action and username are required' });
      }
      const hunters = db.collection('hunters');
      const cleanUsername = username.trim().toLowerCase();

      if (subAction === 'delete') {
        await hunters.deleteOne({ username: cleanUsername });
        return res.status(200).json({ success: true, action: 'deleted' });
      }
      if (subAction === 'suspend') {
        await hunters.updateOne({ username: cleanUsername }, { $set: { suspended: true } });
        return res.status(200).json({ success: true, action: 'suspended' });
      }
      if (subAction === 'unsuspend') {
        await hunters.updateOne({ username: cleanUsername }, { $set: { suspended: false } });
        return res.status(200).json({ success: true, action: 'unsuspended' });
      }
      if (subAction === 'edit') {
        if (!updates || typeof updates !== 'object') {
          return res.status(400).json({ error: 'Updates object is required for edit' });
        }
        const allowedFields = ['level', 'xp', 'xpToNextLevel', 'rank', 'statPoints', 'streak', 'totalXpEarned'];
        const setObj = {};
        for (const key of allowedFields) {
          if (updates[key] !== undefined) setObj[key] = updates[key];
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
    }

    // ---------- STATS OVERVIEW ----------
    if (action === 'stats-overview') {
      if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
      }
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

      return res.status(200).json({ totalVisits, totalHunters, dailyVisitCounts, leaderboard });
    }

    return res.status(400).json({ error: 'Unknown or missing action' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Admin request failed' });
  }
};
