const clientPromise = require('../../lib/mongodb');

function todayKey() {
  return new Date().toISOString().split('T')[0];
}

function currentWeekKey() {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil((((now - jan1) / 86400000) + jan1.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${week}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'solo_leveling_system');
    const hunters = db.collection('hunters');

    const cleanUsername = username.trim().toLowerCase();
    const hunter = await hunters.findOne({ username: cleanUsername });
    if (!hunter) {
      return res.status(404).json({ error: 'Hunter not found' });
    }

    const today = todayKey();
    const week = currentWeekKey();

    // Daily reset
    const missedDaily = (hunter.dailyQuests || []).filter(q => q.periodKey !== today && !q.completed);
    const remainingDaily = (hunter.dailyQuests || []).filter(q => q.periodKey === today);
    const dailyPenalty = missedDaily.length * 5;

    // Weekly reset
    const missedWeekly = (hunter.weeklyQuests || []).filter(q => q.periodKey !== week && !q.completed);
    const remainingWeekly = (hunter.weeklyQuests || []).filter(q => q.periodKey === week);
    const weeklyPenalty = missedWeekly.length * 15;

    const totalPenalty = dailyPenalty + weeklyPenalty;
    const newXp = Math.max(0, hunter.xp - totalPenalty);

    // Break streak if yesterday's dailies weren't all completed
    let streak = hunter.streak;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (hunter.lastDailyCompleteDate !== yesterdayStr && hunter.lastDailyCompleteDate !== today) {
      streak = 0;
    }

    await hunters.updateOne(
      { username: cleanUsername },
      {
        $set: {
          dailyQuests: remainingDaily,
          weeklyQuests: remainingWeekly,
          xp: newXp,
          streak,
          lastActive: new Date()
        }
      }
    );

    return res.status(200).json({
      dailyPenalty,
      weeklyPenalty,
      missedDailyCount: missedDaily.length,
      missedWeeklyCount: missedWeekly.length,
      streakBroken: streak === 0 && hunter.streak > 0
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to reset quests' });
  }
};
