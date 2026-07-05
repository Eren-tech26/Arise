const clientPromise = require('../../lib/mongodb');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { name } = req.query;

    if (!name) {
      return res.status(400).json({ error: 'Hunter name is required' });
    }

    const client = await clientPromise;
    const db = client.db(process.env.DB_NAME || 'solo_leveling_system');
    const hunters = db.collection('hunters');

    const hunter = await hunters.findOne({ name: name.trim() });

    if (!hunter) {
      return res.status(404).json({ error: 'Hunter not found' });
    }

    return res.status(200).json({ hunter });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch hunter' });
  }
};
