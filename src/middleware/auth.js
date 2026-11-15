const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticateToken = async (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    // A signed token alone is not enough: blocked or deleted users lose their session.
    if (!(await User.isActive(decoded.id))) {
      res.clearCookie('token', { httpOnly: true, sameSite: 'lax' });
      return res.status(401).json({ error: 'Session closed' });
    }
  } catch (err) {
    console.error('Session check error:', err);
    return res.status(500).json({ error: 'Failed to check session' });
  }
  req.userId = decoded.id;
  next();
};

module.exports = { authenticateToken };
