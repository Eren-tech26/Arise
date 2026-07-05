const clientPromise = require('../../lib/mongodb');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Hunter name is required' });
    }

    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'solo_leveling_system');
    const hunters = db.collection('hunters');

    const existing = await hunters.findOne({ name: name.trim() });
    if (existing) {
      return res.status(200).json({ hunter: existing, isNew: false });
    }

    const ranks = ['E', 'D', 'C', 'B', 'A'];
    const assignedRank = ranks[Math.floor(Math.random() * ranks.length)];

    const newHunter = {
      name: name.trim(),
      rank: assignedRank,
      level: 1,
      xp: 0,
      xpToNextLevel: 100,
      stats: {
        STR: 10,
        AGI: 10,
        VIT: 10,
        INT: 10,
        SENSE: 10
      },
      statPoints: 0,
      quests: [],
      createdAt: new Date(),
      lastActive: new Date()
    };

    const result = await hunters.insertOne(newHunter);
    newHunter._id = result.insertedId;

    return res.status(201).json({ hunter: newHunter, isNew: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to create hunter' });
  }
};
