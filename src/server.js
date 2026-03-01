const path = require('path');
const express = require('express');
const session = require('express-session');
const env = require('./config/env');
require('./config/db');

const publicRoutes = require('./routes/publicRoutes');
const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { attachCurrentUser } = require('./middleware/auth');
const { consumeFlash } = require('./utils/flash');
const { startScheduler } = require('./services/automation');

const app = express();
app.locals.appName = env.appName;
app.locals.easypaisaNumber = env.easypaisaNumber;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);

app.use(attachCurrentUser);
app.use(consumeFlash);
app.use((req, res, next) => {
  res.locals.appName = env.appName;
  res.locals.easypaisaNumber = env.easypaisaNumber;
  next();
});
app.use(express.static(path.join(__dirname, '../public')));

app.use('/', publicRoutes);
app.use('/', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Not Found',
    message: 'The requested page does not exist.',
  });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).render('error', {
    title: 'Server Error',
    message: 'An unexpected error occurred. Please try again.',
  });
});

app.listen(env.port, () => {
  console.log(`Server running on ${env.appUrl}`);
  startScheduler();
});
