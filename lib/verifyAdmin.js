function verifyAdmin(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const parts = decoded.split(':');
    return parts[0] === 'admin' && parts[2] === process.env.ADMIN_PASSWORD;
  } catch {
    return false;
  }
}

module.exports = verifyAdmin;
