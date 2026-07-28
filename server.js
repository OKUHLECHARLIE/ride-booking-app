const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const MONGODB_URI = 'mongodb+srv://OkuhleCharlie:Lukhanyo@ridecluster.zgmjizs.mongodb.net/?retryWrites=true&w=majority&appName=RideCluster';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('MongoDB connection error:', err));

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});