function isoNow() {
  return new Date().toISOString();
}

function addHours(inputDate, hours) {
  const date = inputDate ? new Date(inputDate) : new Date();
  const next = new Date(date.getTime());
  next.setHours(next.getHours() + hours);
  return next.toISOString();
}

module.exports = {
  isoNow,
  addHours,
};
