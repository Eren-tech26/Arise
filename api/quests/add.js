const clientPromise = require('../../lib/mongodb');

function getPeriodKey(freq) {
  const now = new Date();
  if (freq === 'weekly') {
    const jan1 = new Date(now.getFullYear(), 0, 1);
    const week = Math.ceil((((now - jan1) / 86400000) + jan1.getDay() + 1) / 7);
    return `${now.getFullYear()}-W${week}`;
  }
  return now.toISOString().split('T')[0];
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, questText, xpReward, statType, frequency } = req.body;

    if (!username || !questText) {
      return res.status(400).json({ error: 'Username and quest text are required' });
    }

    const freq = frequency === 'weekly' ? 'weekly' : 'daily';
    const field = freq === 'weekly' ? 'weeklyQuests' : 'dailyQuests';

    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'solo_leveling_system');
    const hunters = db.collection('hunters');

    const quest = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
      text: questText.trim(),
      xpReward: xpReward || (freq === 'weekly' ? 80 : 20),
      statType: statType || 'STR',
      completed: false,
      frequency: freq,
      createdAt: new Date(),
      periodKey: getPeriodKey(freq)
    };

    const result = await hunters.updateOne(
      { username: username.trim().toLowerCase() },
      { $push: { [field]: quest }, $set: { lastActive: new Date() } }
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
