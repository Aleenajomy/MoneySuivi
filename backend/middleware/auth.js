const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { config } = require('../config/env');

const signToken = (user) => jwt.sign(
  { id: user.id, v: user.tokenVersion || 0 },
  config.jwtSecret,
  { expiresIn: config.jwtExpire, algorithm: 'HS256' },
);

const protect = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token' });
  }

  let decoded;
  try {
    // Pinning the algorithm stops alg-confusion tricks such as "none" or RS/HS swaps.
    decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ success: false, message: 'Not authorized, token failed' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    // Tokens issued before a password change carry an older version and are rejected.
    if (!user || (decoded.v || 0) !== user.tokenVersion) {
      return res.status(401).json({ success: false, message: 'Session expired, please sign in again' });
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { protect, signToken };
