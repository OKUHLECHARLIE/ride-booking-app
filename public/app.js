// Initialize the Leaflet map centered on London
const map = L.map('map').setView([51.505, -0.09], 13);

// Add OpenStreetMap tiles as the base layer
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// State variables for tracking markers
let pickupMarker = null;
let dropoffMarker = null;
let clickState = 'pickup';

// Cache DOM element references
const instruction = document.getElementById('instruction');
const rideControls = document.getElementById('ride-controls');
const requestBtn = document.getElementById('request-btn');
const resetBtn = document.getElementById('reset-btn');
const ridesList = document.getElementById('rides-list');
const logoutBtn = document.getElementById('logout-btn');

async function fetchAddress(lat, lng) {
  const response = await fetch(`/api/geocode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`, {
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error('Reverse geocode request failed');
  }

  const data = await response.json();
  return data.address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

function formatLocationLabel(point) {
  if (point?.address) {
    return point.address;
  }
  if (typeof point?.lat === 'number' && typeof point?.lng === 'number') {
    return `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
  }
  return '';
}

async function geocodeRide(ride) {
  const [pickupAddress, dropoffAddress] = await Promise.all([
    fetchAddress(ride.pickup.lat, ride.pickup.lng).catch(err => {
      console.error('Error geocoding pickup:', err);
      return `${ride.pickup.lat.toFixed(4)}, ${ride.pickup.lng.toFixed(4)}`;
    }),
    fetchAddress(ride.dropoff.lat, ride.dropoff.lng).catch(err => {
      console.error('Error geocoding dropoff:', err);
      return `${ride.dropoff.lat.toFixed(4)}, ${ride.dropoff.lng.toFixed(4)}`;
    })
  ]);

  ride.pickup.address = pickupAddress;
  ride.dropoff.address = dropoffAddress;
  return ride;
}

async function logout() {
  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });

    if (response.ok) {
      window.location.href = '/login.html';
    }
  } catch (err) {
    console.error('Error logging out:', err);
  }
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', logout);
}
// Define a green icon for pickup markers
const greenIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Define a red icon for dropoff markers
const redIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});
// Handle map clicks to place pickup and dropoff markers
map.on('click', function (e) {
  if (clickState === 'pickup') {
    if (pickupMarker) map.removeLayer(pickupMarker);
    pickupMarker = L.marker(e.latlng, { icon: greenIcon }).addTo(map).bindPopup('Pickup: Looking up address...').openPopup();
    clickState = 'dropoff';
    instruction.textContent = 'Looking up address...';

    fetchAddress(e.latlng.lat, e.latlng.lng)
      .then(address => {
        pickupMarker.address = address;
        pickupMarker.setPopupContent(`Pickup: ${address}`).openPopup();
        instruction.textContent = 'Now click to set your dropoff location';
      })
      .catch(err => {
        const fallback = `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
        pickupMarker.address = fallback;
        pickupMarker.setPopupContent(`Pickup: ${fallback}`).openPopup();
        instruction.textContent = 'Now click to set your dropoff location';
        console.error('Error fetching pickup address:', err);
      });
  } else if (clickState === 'dropoff') {
    if (dropoffMarker) map.removeLayer(dropoffMarker);
    dropoffMarker = L.marker(e.latlng, { icon: redIcon }).addTo(map).bindPopup('Dropoff: Looking up address...').openPopup();
    clickState = 'done';
    instruction.textContent = 'Looking up address...';
    rideControls.classList.remove('hidden');

    fetchAddress(e.latlng.lat, e.latlng.lng)
      .then(address => {
        dropoffMarker.address = address;
        dropoffMarker.setPopupContent(`Dropoff: ${address}`).openPopup();
        instruction.textContent = 'Ready! Click "Request Ride" to submit.';
      })
      .catch(err => {
        const fallback = `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
        dropoffMarker.address = fallback;
        dropoffMarker.setPopupContent(`Dropoff: ${fallback}`).openPopup();
        instruction.textContent = 'Ready! Click "Request Ride" to submit.';
        console.error('Error fetching dropoff address:', err);
      });
  }
});
// Remove both markers and reset state
function resetMarkers() {
  if (pickupMarker) map.removeLayer(pickupMarker);
  if (dropoffMarker) map.removeLayer(dropoffMarker);
  pickupMarker = null;
  dropoffMarker = null;
  clickState = 'pickup';
  instruction.textContent = 'Click the map to set your pickup location';
  rideControls.classList.add('hidden');
}

resetBtn.addEventListener('click', resetMarkers);

function addRideToList(ride) {
  const pickupLabel = formatLocationLabel(ride.pickup);
  const dropoffLabel = formatLocationLabel(ride.dropoff);

  const li = document.createElement('li');
  li.innerHTML = `
    <span class="status ${ride.status}">${ride.status}</span>
    Pickup: ${pickupLabel}<br>
    Dropoff: ${dropoffLabel}
  `;
  ridesList.prepend(li);
}
function addRideToMap(ride) {
  // Draw a teal circle at the pickup location
  L.circleMarker([ride.pickup.lat, ride.pickup.lng], {
    radius: 8,
    color: '#00d4aa',
    fillColor: '#00d4aa',
    fillOpacity: 0.7
  }).addTo(map).bindPopup('Pickup (Ride ' + ride._id.slice(-4) + ')');

  // Draw a red circle at the dropoff location
  L.circleMarker([ride.dropoff.lat, ride.dropoff.lng], {
    radius: 8,
    color: '#e74c3c',
    fillColor: '#e74c3c',
    fillOpacity: 0.7
  }).addTo(map).bindPopup('Dropoff (Ride ' + ride._id.slice(-4) + ')');

  // Connect pickup and dropoff with a purple dashed line
  L.polyline([
    [ride.pickup.lat, ride.pickup.lng],
    [ride.dropoff.lat, ride.dropoff.lng]
  ], { color: '#7c3aed', weight: 2, dashArray: '5, 10' }).addTo(map);
}
requestBtn.addEventListener('click', async function () {
  if (!pickupMarker || !dropoffMarker) return;

  // Build the ride data from marker positions
  const rideData = {
    pickup: {
      lat: pickupMarker.getLatLng().lat,
      lng: pickupMarker.getLatLng().lng
    },
    dropoff: {
      lat: dropoffMarker.getLatLng().lat,
      lng: dropoffMarker.getLatLng().lng
    }
  };

  // Send the ride to the server
  try {
    const response = await fetch('/api/rides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(rideData)
    });

    if (response.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    const savedRide = await response.json();
    const displayRide = {
      ...savedRide,
      pickup: { ...savedRide.pickup, address: pickupMarker?.address },
      dropoff: { ...savedRide.dropoff, address: dropoffMarker?.address }
    };
    addRideToList(displayRide);
    addRideToMap(savedRide);
    resetMarkers();
  } catch (err) {
    console.error('Error requesting ride:', err);
  }
});
// Fetch all rides from the database and display them
async function loadRides() {
  try {
    const response = await fetch('/api/rides', { credentials: 'include' });
    if (response.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    const rides = await response.json();
    const geocodedRides = await Promise.all(rides.map(ride => geocodeRide(ride)));
    geocodedRides.forEach(ride => {
      addRideToList(ride);
      addRideToMap(ride);
    });
  } catch (err) {
    console.error('Error loading rides:', err);
  }
}

// Load rides as soon as the page opens
loadRides();