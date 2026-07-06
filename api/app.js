const bcrypt = require('bcryptjs');
const clientPromise = require('../lib/mongodb');

function todayKey() { return new Date().toISOString().split('T')[0]; }
function yesterdayKey() { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; }
function currentWeekKey() {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil((((now - jan1) / 86400000) + jan1.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${week}`;
}
function getPeriodKey(freq) { return freq === 'weekly' ? currentWeekKey() : todayKey(); }

const RANK_THRESHOLDS = [
  { rank: 'S', min: 15000 }, { rank: 'A', min: 7000 }, { rank: 'B', min: 3500 },
  { rank: 'C', min: 1500 }, { rank: 'D', min: 500 }, { rank: 'E', min: 0 }
];
function calculateRank(totalXp) { return RANK_THRESHOLDS.find(r => totalXp >= r.min).rank; }

function calculateLevelUp(level, xp, xpToNextLevel, statPoints) {
  while (xp >= xpToNextLevel) {
    xp -= xpToNextLevel; level += 1; statPoints += 3;
    xpToNextLevel = Math.floor(xpToNextLevel * 1.15);
  }
  return { level, xp, xpToNextLevel, statPoints };
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

const DEFAULT_GROUPS = [
  { id: 'grp_body', name: 'Body Training', color: '#00c8ff' },
  { id: 'grp_mind', name: 'Mind & Study', color: '#7c5cff' },
  { id: 'grp_discipline', name: 'Discipline', color: '#00eaff' },
  { id: 'grp_growth', name: 'Personal Growth', color: '#ff9f43' },
  { id: 'grp_health', name: 'Health & Rest', color: '#4ade80' }
];

module.exports = async (req, res) => {
  const { action } = req.query;

  try {
    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'solo_leveling_system');
    const hunters = db.collection('hunters');

    // ---------- SIGNUP ----------
    if (action === 'signup') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { username, password } = req.body;

      if (!username || username.trim().length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
      if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

      const cleanUsername = username.trim().toLowerCase();
      const existing = await hunters.findOne({ username: cleanUsername });
      if (existing) return res.status(409).json({ error: 'That username is already taken' });

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
        groups: DEFAULT_GROUPS,
        dailyQuests: [],
        weeklyQuests: [],
        streak: 0,
        lastDailyCompleteDate: null,
        achievements: [],
        questHistory: [],
        suspended: false,
        deleted: false,
        createdAt: new Date(),
        lastActive: new Date()
      };

      const result = await hunters.insertOne(newHunter);
      newHunter._id = result.insertedId;
      delete newHunter.passwordHash;

      return res.status(201).json({ hunter: newHunter });
    }

    // ---------- LOGIN ----------
    if (action === 'login') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { username, password } = req.body;
      if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

      const cleanUsername = username.trim().toLowerCase();
      const hunter = await hunters.findOne({ username: cleanUsername });
      if (!hunter) return res.status(401).json({ error: 'Invalid username or password' });
      if (hunter.deleted) return res.status(403).json({ error: 'This account no longer exists.' });
      if (hunter.suspended) return res.status(403).json({ error: 'This account has been suspended.' });

      const valid = await bcrypt.compare(password, hunter.passwordHash);
      if (!valid) return res.status(401).json({ error: 'Invalid username or password' });

      if (!hunter.groups || hunter.groups.length === 0) {
        await hunters.updateOne({ username: cleanUsername }, { $set: { groups: DEFAULT_GROUPS } });
        hunter.groups = DEFAULT_GROUPS;
      }

      await hunters.updateOne({ username: cleanUsername }, { $set: { lastActive: new Date() } });

      delete hunter.passwordHash;
      return res.status(200).json({ hunter });
    }

    // ---------- GROUPS: add ----------
    if (action === 'group-add') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { username, name, color } = req.body;
      if (!username || !name || !name.trim()) return res.status(400).json({ error: 'Username and group name are required' });

      const cleanUsername = username.trim().toLowerCase();
      const group = { id: 'grp_' + Date.now().toString(36), name: name.trim(), color: color || '#00c8ff' };

      const result = await hunters.updateOne(
        { username: cleanUsername },
        { $push: { groups: group }, $set: { lastActive: new Date() } }
      );
      if (result.matchedCount === 0) return res.status(404).json({ error: 'Hunter not found' });

      return res.status(201).json({ group });
    }

    // ---------- GROUPS: delete ----------
    if (action === 'group-delete') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { username, groupId } = req.body;
      if (!username || !groupId) return res.status(400).json({ error: 'Username and groupId are required' });

      const cleanUsername = username.trim().toLowerCase();

      await hunters.updateOne(
        { username: cleanUsername },
        {
          $pull: {
            groups: { id: groupId },
            dailyQuests: { groupId },
            weeklyQuests: { groupId }
          },
          $set: { lastActive: new Date() }
        }
      );

      return res.status(200).json({ success: true });
    }

    // ---------- QUESTS: add ----------
    if (action === 'quest-add') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { username, questText, xpReward, statType, frequency, groupId } = req.body;
      if (!username || !questText) return res.status(400).json({ error: 'Username and quest text are required' });

      const freq = frequency === 'weekly' ? 'weekly' : 'daily';
      const field = freq === 'weekly' ? 'weeklyQuests' : 'dailyQuests';
      const cleanUsername = username.trim().toLowerCase();

      const quest = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
        text: questText.trim(),
        xpReward: xpReward || (freq === 'weekly' ? 80 : 20),
        statType: statType || 'STR',
        completed: false,
        frequency: freq,
        groupId: groupId || null,
        createdAt: new Date(),
        periodKey: getPeriodKey(freq)
      };

      const result = await hunters.updateOne(
        { username: cleanUsername },
        { $push: { [field]: quest }, $set: { lastActive: new Date() } }
      );
      if (result.matchedCount === 0) return res.status(404).json({ error: 'Hunter not found' });

      return res.status(201).json({ quest });
    }

    // ---------- QUESTS: edit (blocked if already completed) ----------
    if (action === 'quest-edit') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { username, questId, frequency, text, xpReward, groupId } = req.body;
      if (!username || !questId) return res.status(400).json({ error: 'Username and quest ID are required' });

      const field = frequency === 'weekly' ? 'weeklyQuests' : 'dailyQuests';
      const cleanUsername = username.trim().toLowerCase();

      const hunter = await hunters.findOne({ username: cleanUsername });
      if (!hunter) return res.status(404).json({ error: 'Hunter not found' });

      const quest = (hunter[field] || []).find(q => q.id === questId);
      if (!quest) return res.status(404).json({ error: 'Quest not found' });
      if (quest.completed) return res.status(400).json({ error: 'Cannot edit a completed quest' });

      const setObj = {};
      if (text !== undefined && text.trim()) setObj[`${field}.$.text`] = text.trim();
      if (xpReward !== undefined) setObj[`${field}.$.xpReward`] = xpReward;
      if (groupId !== undefined) setObj[`${field}.$.groupId`] = groupId;

      if (Object.keys(setObj).length === 0) return res.status(400).json({ error: 'Nothing to update' });

      await hunters.updateOne(
        { username: cleanUsername, [`${field}.id`]: questId },
        { $set: { ...setObj, lastActive: new Date() } }
      );

      return res.status(200).json({ success: true });
    }

    // ---------- QUESTS: delete (blocked if already completed) ----------
    if (action === 'quest-delete') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { username, questId, frequency } = req.body;
      if (!username || !questId) return res.status(400).json({ error: 'Username and quest ID are required' });

      const field = frequency === 'weekly' ? 'weeklyQuests' : 'dailyQuests';
      const cleanUsername = username.trim().toLowerCase();

      const hunter = await hunters.findOne({ username: cleanUsername });
      if (!hunter) return res.status(404).json({ error: 'Hunter not found' });

      const quest = (hunter[field] || []).find(q => q.id === questId);
      if (!quest) return res.status(404).json({ error: 'Quest not found' });
      if (quest.completed) return res.status(400).json({ error: 'Cannot delete a completed quest' });

      await hunters.updateOne(
        { username: cleanUsername },
        { $pull: { [field]: { id: questId } }, $set: { lastActive: new Date() } }
      );

      return res.status(200).json({ success: true });
    }

    // ---------- QUESTS: complete ----------
    if (action === 'quest-complete') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { username, questId, frequency } = req.body;
      if (!username || !questId) return res.status(400).json({ error: 'Username and quest ID are required' });

      const field = frequency === 'weekly' ? 'weeklyQuests' : 'dailyQuests';
      const cleanUsername = username.trim().toLowerCase();
      const hunter = await hunters.findOne({ username: cleanUsername });
      if (!hunter) return res.status(404).json({ error: 'Hunter not found' });

      const questList = hunter[field] || [];
      const quest = questList.find(q => q.id === questId);
      if (!quest) return res.status(404).json({ error: 'Quest not found' });
      if (quest.completed) return res.status(400).json({ error: 'Quest already completed' });

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
          streak = lastDailyCompleteDate === yesterdayKey() ? streak + 1 : 1;
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
      if (newAchievements.length > 0) pushObj.achievements = { $each: newAchievements };

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
    }

    // ---------- QUESTS: reset (daily/weekly rollover + penalties) ----------
    if (action === 'quest-reset') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { username } = req.body;
      if (!username) return res.status(400).json({ error: 'Username is required' });

      const cleanUsername = username.trim().toLowerCase();
      const hunter = await hunters.findOne({ username: cleanUsername });
      if (!hunter) return res.status(404).json({ error: 'Hunter not found' });

      const today = todayKey();
      const week = currentWeekKey();

      const missedDaily = (hunter.dailyQuests || []).filter(q => q.periodKey !== today && !q.completed);
      const remainingDaily = (hunter.dailyQuests || []).filter(q => q.periodKey === today);
      const dailyPenalty = missedDaily.length * 5;

      const missedWeekly = (hunter.weeklyQuests || []).filter(q => q.periodKey !== week && !q.completed);
      const remainingWeekly = (hunter.weeklyQuests || []).filter(q => q.periodKey === week);
      const weeklyPenalty = missedWeekly.length * 15;

      const totalPenalty = dailyPenalty + weeklyPenalty;
      const newXp = Math.max(0, hunter.xp - totalPenalty);

      let streak = hunter.streak;
      const yStr = yesterdayKey();
      if (hunter.lastDailyCompleteDate !== yStr && hunter.lastDailyCompleteDate !== today) {
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
        dailyPenalty, weeklyPenalty,
        missedDailyCount: missedDaily.length,
        missedWeeklyCount: missedWeekly.length,
        streakBroken: streak === 0 && hunter.streak > 0
      });
    }

    // ---------- STATS: allocate ----------
    if (action === 'stat-allocate') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const VALID_STATS = ['STR', 'AGI', 'VIT', 'INT', 'SENSE'];
      const { username, stat, points } = req.body;

      if (!username || !VALID_STATS.includes(stat) || !points || points < 1) {
        return res.status(400).json({ error: 'Invalid request' });
      }

      const cleanUsername = username.trim().toLowerCase();
      const hunter = await hunters.findOne({ username: cleanUsername });
      if (!hunter) return res.status(404).json({ error: 'Hunter not found' });
      if (hunter.statPoints < points) return res.status(400).json({ error: 'Not enough stat points' });

      const statField = `stats.${stat}`;
      await hunters.updateOne(
        { username: cleanUsername },
        { $inc: { [statField]: points, statPoints: -points }, $set: { lastActive: new Date() } }
      );

      return res.status(200).json({ success: true });
    }

    // ---------- TRACKING: visit ----------
    if (action === 'track-visit') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { username, page, tab } = req.body;
      const visits = db.collection('visits');

      await visits.insertOne({
        username: username ? username.trim().toLowerCase() : null,
        page: page || 'unknown',
        tab: tab || null,
        timestamp: new Date(),
        dateKey: todayKey()
      });

      return res.status(200).json({ success: true });
    }

    // ---------- TRACKING: session ----------
    if (action === 'track-session') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const { username, event } = req.body;
      if (!username || !event) return res.status(400).json({ error: 'Username and event are required' });

      const sessions = db.collection('sessions');
      await sessions.insertOne({ username: username.trim().toLowerCase(), event, timestamp: new Date() });

      return res.status(200).json({ success: true });
    }

    // ---------- BROADCAST (public GET, no admin needed to read) ----------
    if (action === 'broadcast') {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
      const broadcasts = db.collection('broadcasts');
      const latest = await broadcasts.find({}).sort({ createdAt: -1 }).limit(1).toArray();
      return res.status(200).json({ broadcast: latest[0] || null });
    }

    return res.status(400).json({ error: 'Unknown or missing action' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Request failed' });
  }
};
