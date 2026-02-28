function setFlash(req, type, message) {
  req.session.flash = { type, message };
}

function consumeFlash(req, _res, next) {
  if (req.session && req.session.flash) {
    _res.locals.flash = req.session.flash;
    delete req.session.flash;
  } else {
    _res.locals.flash = null;
  }
  next();
}

module.exports = {
  setFlash,
  consumeFlash,
};
