const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const {MongoStore} = require('connect-mongo');
const bcrypt = require('bcrypt');
const fs = require('fs');
const https = require('https');
const path = require('path');
require('dotenv').config();
const Ride = require('./models/Ride');
const User = require('./models/User');

const app = express();
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}
app.use(cors());
app.use(express.json());
app.use(session({
  secret: 'ride-booking-session-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI
  }),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
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

const locationsCachePath = path.join(__dirname, 'locations.json');

async function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (response) => {
      let responseBody = '';
      response.on('data', (chunk) => { responseBody += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          return reject(new Error(`Reverse geocoding returned status ${response.statusCode}`));
        }
        try {
          resolve(JSON.parse(responseBody));
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const earthRadiusKm = 6371;
  const lat1Rad = lat1 * (Math.PI / 180);
  const lat2Rad = lat2 * (Math.PI / 180);
  const deltaLat = (lat2 - lat1) * (Math.PI / 180);
  const deltaLng = (lng2 - lng1) * (Math.PI / 180);

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function formatAddressFromStructured(structuredAddress = {}, fallback) {
  const rawStreet = structuredAddress.road || structuredAddress.pedestrian || structuredAddress.footway;
  const houseNumber = structuredAddress.house_number;
  // Prepend house number to street when available
  let street = rawStreet ? (houseNumber ? `${houseNumber} ${rawStreet}` : rawStreet) : (houseNumber ? String(houseNumber) : '');
  const suburb = structuredAddress.suburb || structuredAddress.neighbourhood;
  const city = structuredAddress.city || structuredAddress.town || structuredAddress.village;
  const parts = [street, suburb, city].filter(Boolean);
  if (parts.length) return parts.join(', ');
  return fallback || '';
}

async function calculateRouteMetrics(pickupLat, pickupLng, dropoffLat, dropoffLng) {
  const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${encodeURIComponent(pickupLng)},${encodeURIComponent(pickupLat)};${encodeURIComponent(dropoffLng)},${encodeURIComponent(dropoffLat)}?overview=full&geometries=geojson`;

  try {
    const routeData = await fetchJson(osrmUrl);
    const route = routeData?.routes?.[0];

    if (route && typeof route.distance === 'number') {
      const distanceKm = Number((route.distance / 1000).toFixed(1));
      return {
        distanceKm,
        price: Number((distanceKm * 7).toFixed(2)),
        route: route.geometry?.coordinates || null
      };
    }
  } catch (err) {
    console.error('OSRM route error:', err);
  }

  const distanceKm = Number(haversineDistanceKm(pickupLat, pickupLng, dropoffLat, dropoffLng).toFixed(1));
  return {
    distanceKm,
    price: Number((distanceKm * 7).toFixed(2)),
    route: null
  };
}

app.get('/api/geocode', async (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ error: 'lat and lng query parameters are required' });
  }

  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  let cacheData = {};

  try {
    const fileContents = await fs.promises.readFile(locationsCachePath, 'utf8');
    cacheData = JSON.parse(fileContents || '{}');
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('Error reading locations cache:', err);
      return res.status(500).json({ error: 'Could not read location cache' });
    }
  }

  if (cacheData[cacheKey]) {
    return res.json({ address: cacheData[cacheKey] });
  }

  try {
    // Nominatim usage policy recommends at most 1 request per second for small apps.
    // This app is small, so a comment safeguard is sufficient rather than a queue.
    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
    const apiResponse = await fetchJson(nominatimUrl, {
      'User-Agent': 'RideBookingApp/1.0 (contact: charlieokuhle4@gmail.com)'
    });

    const fallbackAddress = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    const structuredAddress = apiResponse?.address || {};
    const address = formatAddressFromStructured(structuredAddress, apiResponse?.display_name || fallbackAddress);

    if (address && address !== fallbackAddress) {
      cacheData[cacheKey] = address;
      await fs.promises.writeFile(locationsCachePath, JSON.stringify(cacheData, null, 2), 'utf8');
    }

    res.json({ address });
  } catch (err) {
    console.error('Reverse geocode error:', err);
    res.json({ address: `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
  }
});

app.get('/api/route', async (req, res) => {
  const pickupLat = parseFloat(req.query.pickupLat);
  const pickupLng = parseFloat(req.query.pickupLng);
  const dropoffLat = parseFloat(req.query.dropoffLat);
  const dropoffLng = parseFloat(req.query.dropoffLng);

  if ([pickupLat, pickupLng, dropoffLat, dropoffLng].some(value => Number.isNaN(value))) {
    return res.status(400).json({ error: 'pickupLat, pickupLng, dropoffLat, and dropoffLng query parameters are required' });
  }

  try {
    const metrics = await calculateRouteMetrics(pickupLat, pickupLng, dropoffLat, dropoffLng);
    res.json({
      route: metrics.route,
      distanceKm: metrics.distanceKm,
      price: metrics.price
    });
  } catch (err) {
    console.error('Route calculation error:', err);
    res.status(500).json({ error: 'Could not fetch route' });
  }
});

app.get('/api/search', async (req, res) => {
  const query = String(req.query.q || '').trim();

  if (!query) {
    return res.json([]);
  }
  const viewboxMinLng = req.query.viewboxMinLng;
  const viewboxMinLat = req.query.viewboxMinLat;
  const viewboxMaxLng = req.query.viewboxMaxLng;
  const viewboxMaxLat = req.query.viewboxMaxLat;

  let searchUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=5&addressdetails=1&countrycodes=za&q=${encodeURIComponent(query)}`;

  if (viewboxMinLng && viewboxMinLat && viewboxMaxLng && viewboxMaxLat) {
    // viewbox biases results toward the given bounding box; bounded=0 ensures it's only a bias, not a hard restriction
    searchUrl += `&viewbox=${encodeURIComponent(viewboxMinLng)},${encodeURIComponent(viewboxMinLat)},${encodeURIComponent(viewboxMaxLng)},${encodeURIComponent(viewboxMaxLat)}&bounded=0`;
  }

  try {
    const results = await fetchJson(searchUrl, {
      'User-Agent': 'RideBookingApp/1.0 (contact: charlieokuhle4@gmail.com)'
    });

    const normalizedResults = (Array.isArray(results) ? results : []).map(result => {
      const display = formatAddressFromStructured(result?.address || {}, result?.display_name || `${result?.lat || 0}, ${result?.lon || 0}`);
      return {
        displayName: display || (result?.display_name || `${result?.lat || 0}, ${result?.lon || 0}`),
        lat: parseFloat(result?.lat),
        lng: parseFloat(result?.lon)
      };
    }).filter(result => !Number.isNaN(result.lat) && !Number.isNaN(result.lng));

    res.json(normalizedResults);
  } catch (err) {
    console.error('Search geocoding error:', err);
    res.json([]);
  }
});

const MONGODB_URI = process.env.MONGODB_URI;

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
    const routeMetrics = await calculateRouteMetrics(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
    const ride = new Ride({
      pickup,
      dropoff,
      riderId: req.session.userId,
      distanceKm: routeMetrics.distanceKm,
      price: routeMetrics.price
    });
    const savedRide = await ride.save();
    res.status(201).json(savedRide);
  } 
  catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/rides/:id', requireAuth, requireRole('rider'), async (req, res) => {
  try {
    const ride = await Ride.findById(req.params.id);

    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }

    if (ride.riderId.toString() !== req.session.userId.toString()) {
      return res.status(403).json({ error: 'You can only delete your own completed rides' });
    }

    if (ride.status !== 'completed') {
      return res.status(400).json({ error: 'Only completed rides can be deleted' });
    }

    await Ride.findByIdAndDelete(req.params.id);
    res.json({ message: 'Ride deleted successfully' });
  } catch (err) {
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
