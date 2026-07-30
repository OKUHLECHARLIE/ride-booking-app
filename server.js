const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Ride = require('./models/Ride');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const MONGODB_URI = 'mongodb+srv://OkuhleCharlie:Lukhanyo@ridecluster.zgmjizs.mongodb.net/?retryWrites=true&w=majority&appName=RideCluster';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('MongoDB connection error:', err));

app.post('/api/rides', async (req, res) => {
  try {
    const { pickup, dropoff } = req.body;
    const ride = new Ride({ pickup, dropoff });
    const savedRide = await ride.save();
    res.status(201).json(savedRide);
  } 
  catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/rides', async (req, res) => {
  try {
    const rides = await Ride.find().sort({ createdAt: -1 });
    res.json(rides);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.patch('/api/rides/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const ride = await Ride.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
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
