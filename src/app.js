const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');

const app = express();

app.use(cors({
  origin: [process.env.AUTH_FRONTEND_URL],
  credentials: true
}));
app.use(cookieParser());
// This route parses JSON incrementally instead of buffering it with body-parser.
app.use('/exports', require('./routes/exports'));
app.use(bodyParser.json());

app.get('/health', (req, res) => {
  res.json({ status: 'Auth Service running' });
});

app.use('/auth', require('./routes/auth'));
app.use('/products', require('./routes/products'));
app.use('/allergens', require('./routes/allergens'));
app.use('/offers', require('./routes/offers'));
app.use('/roles', require('./routes/roles'));
app.use('/permissions', require('./routes/permissions'));
app.use('/users', require('./routes/users'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
