const clientPromise = require('../../lib/mongodb');

const RANK_THRESHOLDS = [
  { rank: 'S', min: 15000 },
  { rank: 'A', min: 7000 },
  { rank: 'B', min: 3500 },
  { rank: 'C', min: 1500 },
  { rank: 'D', min: 500 },
  { rank: 'E', min: 0 }
];

function calculateRank(totalXp) {
  return RANK_THRESHOLDS.find(r => totalXp >= r.min).rank;
}

function calculateLevelUp(level, xp, xpToNextLevel, statPoints) {
  while (xp >= xpToNextLevel) {
    xp -= xpToNextLevel;
    level += 1;
    statPoints += 3;
    xpToNextLevel = Math.floor(xpToNextLevel * 1.15);
  }
  return { level, xp, xpToNextLevel, statPoints };
}

function todayKey() {
  return new Date().toISOString().split('T')[0];
}

function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

const ACHIEVEMENT_DEFS = [
  { id: 'first_quest', label: 'First Steps', check: (h) => h.questHistory.length >= 1 },
  { id: 'streak_7', label: '7-Day Streak', check: (h) => h.streak >= 7 },
  { id: 'streak_30', label: 'Iron Will (30-Day Streak)', check: (h) => h.streak >= 30 },
  { id: 'rank_d', label: 'Rank Up: D', check: (h) => h.rank !== 'E' },
  { id: 'rank_c', label: 'Rank Up: C', check: (h) => ['C', 'B', 'A', 'S'].includes(h.rank) },
  { id: 'rank_b', label: 'Rank Up: B', check: (h) => ['B', 'A', 'S'].includes(h.rank) },
  { id: 'rank_a', label: 'Rank Up: A', check: (h) => ['A', 'S'].includes(h.rank) },
  { id: 'rank_s', label: 'Shadow Monarch (Rank S)', check: (h) => h.rank === 'S' },
  { id: 'level_10', label: 'Level 10', check: (h) => h.level >= 10 },
  { id: 'level_25', label: 'Level 25', check: (h) => h.level >= 25 },
  { id: 'quests_50', label: '50 Quests Completed', check: (h) => h.questHistory.length >= 50 }
];

function checkNewAchievements(hunter) {
  const unlockedIds = hunter.achievements.map(a => a.id);
  const newlyUnlocked = [];

  for (const def of ACHIEVEMENT_DEFS) {
    if (!unlockedIds.includes(def.id) && def.check(hunter)) {
      newlyUnlocked.push({ id: def.id, label: def.label, unlockedAt: new Date() });
    }
  }

  return newlyUnlocked;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, questId, frequency } = req.body;

    if (!username || !questId) {
      return res.status(400).json({ error: 'Username and quest ID are required' });
    }

    const field = frequency === 'weekly' ? 'weeklyQuests' : 'dailyQuests';

    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'solo_leveling_system');
    const hunters = db.collection('hunters');

    const cleanUsername = username.trim().toLowerCase();
    const hunter = await hunters.findOne({ username: cleanUsername });
    if (!hunter) {
      return res.status(404).json({ error: 'Hunter not found' });
    }

    const questList = hunter[field] || [];
    const quest = questList.find(q => q.id === questId);
    if (!quest) {
      return res.status(404).json({ error: 'Quest not found' });
    }
    if (quest.completed) {
      return res.status(400).json({ error: 'Quest already completed' });
    }

    const previousRank = hunter.rank;
    const newTotalXp = hunter.totalXpEarned + quest.xpReward;
    const newXp = hunter.xp + quest.xpReward;

    const leveled = calculateLevelUp(hunter.level, newXp, hunter.xpToNextLevel, hunter.statPoints);
    const newRank = calculateRank(newTotalXp);

    let streak = hunter.streak;
    let lastDailyCompleteDate = hunter.lastDailyCompleteDate;

    if (field === 'dailyQuests') {
      const allDailiesToday = questList.filter(q => q.periodKey === todayKey());
      const completedCountAfterThis = allDailiesToday.filter(q => q.completed || q.id === questId).length;

      if (completedCountAfterThis === allDailiesToday.length && lastDailyCompleteDate !== todayKey()) {
        if (lastDailyCompleteDate === yesterdayKey()) {
          streak += 1;
        } else {
          streak = 1;
        }
        lastDailyCompleteDate = todayKey();
      }
    }

    const questHistoryEntry = {
      questId: quest.id,
      text: quest.text,
      xpReward: quest.xpReward,
      frequency: field === 'weeklyQuests' ? 'weekly' : 'daily',
      completedAt: new Date()
    };

    const updatedHunterForAchievements = {
      ...hunter,
      level: leveled.level,
      rank: newRank,
      streak,
      questHistory: [...hunter.questHistory, questHistoryEntry]
    };

    const newAchievements = checkNewAchievements(updatedHunterForAchievements);

    const pushObj = { questHistory: questHistoryEntry };
    if (newAchievements.length > 0) {
      pushObj.achievements = { $each: newAchievements };
    }

    await hunters.updateOne(
      { username: cleanUsername, [`${field}.id`]: questId },
      {
        $set: {
          [`${field}.$.completed`]: true,
          level: leveled.level,
          xp: leveled.xp,
          xpToNextLevel: leveled.xpToNextLevel,
          statPoints: leveled.statPoints,
          totalXpEarned: newTotalXp,
          rank: newRank,
          streak,
          lastDailyCompleteDate,
          lastActive: new Date()
        },
        $push: pushObj
      }
    );

    return res.status(200).json({
      xpGained: quest.xpReward,
      leveledUp: leveled.level > hunter.level,
      newLevel: leveled.level,
      statPointsGained: leveled.level > hunter.level ? (leveled.level - hunter.level) * 3 : 0,
      rankedUp: newRank !== previousRank,
      newRank,
      streak,
      newAchievements,
      hunter: {
        ...hunter,
        level: leveled.level,
        xp: leveled.xp,
        xpToNextLevel: leveled.xpToNextLevel,
        statPoints: leveled.statPoints,
        totalXpEarned: newTotalXp,
        rank: newRank,
        streak
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to complete quest' });
  }
};
