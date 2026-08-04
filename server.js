const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const bcrypt = require('bcrypt');
const Ride = require('./models/Ride');
const User = require('./models/User');

const app = express();
app.use(cors());
app.use(express.json());
app.use(session({
  secret: 'ride-booking-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false,
    maxAge: 1000 * 60 * 60 * 24
  }
}));

app.get('/', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login.html');
  }

  if (req.session.role === 'driver') {
    return res.redirect('/driver.html');
  }

  return res.redirect('/index.html');
});

const requireAuth = (req, res, next) => {
  if (!req.session.userId || !req.session.role) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  next();
};

const requireRole = role => (req, res, next) => {
  if (req.session.role !== role) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  next();
};

app.use(express.static('public'));

const MONGODB_URI = 'mongodb+srv://OkuhleCharlie:Lukhanyo@ridecluster.zgmjizs.mongodb.net/?retryWrites=true&w=majority&appName=RideCluster';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('MongoDB connection error:', err));

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({ error: 'Username, password, and role are required' });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword, role });
    const savedUser = await user.save();

    req.session.userId = savedUser._id;
    req.session.role = savedUser.role;

    res.status(201).json({
      message: 'User registered successfully',
      role: savedUser.role
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
      return res.status(400).json({ error: 'Username, password, and role are required' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (user.role !== role) {
      return res.status(403).json({ error: 'Role does not match selected account type' });
    }

    req.session.userId = user._id;
    req.session.role = user.role;

    res.json({ role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out' });
    }

    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully' });
  });
});

app.post('/api/rides', requireAuth, requireRole('rider'), async (req, res) => {
  try {
    const { pickup, dropoff } = req.body;
    const ride = new Ride({
      pickup,
      dropoff,
      riderId: req.session.userId
    });
    const savedRide = await ride.save();
    res.status(201).json(savedRide);
  } 
  catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/rides', requireAuth, async (req, res) => {
  try {
    let rides;

    if (req.session.role === 'rider') {
      rides = await Ride.find({ riderId: req.session.userId }).sort({ createdAt: -1 });
    } else {
      rides = await Ride.find({ status: { $ne: 'completed' } }).sort({ createdAt: -1 });
    }

    res.json(rides);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/rides/:id', requireAuth, requireRole('driver'), async (req, res) => {
  try {
    const { status } = req.body;
    const ride = await Ride.findByIdAndUpdate(
      req.params.id,
      { status },
      { returnDocument: true, runValidators: true }
    );
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }
    res.json(ride);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
