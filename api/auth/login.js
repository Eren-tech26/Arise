const bcrypt = require('bcryptjs');
const clientPromise = require('../../lib/mongodb');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const cleanUsername = username.trim().toLowerCase();

    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'solo_leveling_system');
    const hunters = db.collection('hunters');

    const hunter = await hunters.findOne({ username: cleanUsername });
    if (!hunter) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const valid = await bcrypt.compare(password, hunter.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    await hunters.updateOne({ username: cleanUsername }, { $set: { lastActive: new Date() } });

    delete hunter.passwordHash;
    return res.status(200).json({ hunter });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Login failed' });
  }
};
