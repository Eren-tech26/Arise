const bcrypt = require('bcryptjs');
const clientPromise = require('../../lib/mongodb');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body;

    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const cleanUsername = username.trim().toLowerCase();

    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'solo_leveling_system');
    const hunters = db.collection('hunters');

    const existing = await hunters.findOne({ username: cleanUsername });
    if (existing) {
      return res.status(409).json({ error: 'That username is already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newHunter = {
      username: cleanUsername,
      displayName: username.trim(),
      passwordHash,
      rank: 'E',
      totalXpEarned: 0,
      level: 1,
      xp: 0,
      xpToNextLevel: 100,
      stats: { STR: 10, AGI: 10, VIT: 10, INT: 10, SENSE: 10 },
      statPoints: 0,
      dailyQuests: [],
      weeklyQuests: [],
      streak: 0,
      lastDailyCompleteDate: null,
      achievements: [],
      questHistory: [],
      suspended: false,
      createdAt: new Date(),
      lastActive: new Date()
    };

    const result = await hunters.insertOne(newHunter);
    newHunter._id = result.insertedId;
    delete newHunter.passwordHash;

    return res.status(201).json({ hunter: newHunter });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Signup failed' });
  }
};
