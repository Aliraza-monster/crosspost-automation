const db = require('../config/db');

function attachCurrentUser(req, res, next) {
  res.locals.currentUser = null;
  res.locals.isAdmin = false;
  res.locals.currentPath = req.path;

  if (!req.session || !req.session.userId) {
    return next();
  }

  const user = db
    .prepare('SELECT id, name, email, is_admin FROM users WHERE id = ?')
    .get(req.session.userId);

  if (!user) {
    req.session.destroy(() => next());
    return;
  }

  req.user = user;
  res.locals.currentUser = user;
  res.locals.isAdmin = user.is_admin === 1;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.redirect('/login');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.is_admin !== 1) {
    return res.status(403).render('error', {
      title: 'Forbidden',
      message: 'Admin access required.',
    });
  }
  next();
}

module.exports = {
  attachCurrentUser,
  requireAuth,
  requireAdmin,
};
