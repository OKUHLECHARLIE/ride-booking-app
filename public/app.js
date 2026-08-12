// Initialize the Leaflet map centered on Cape Town
const map = L.map('map').setView([-33.9249, 18.4241], 13);

// Add OpenStreetMap tiles as the base layer
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// State variables for tracking markers
let pickupMarker = null;
let dropoffMarker = null;
let clickState = 'pickup';
let currentRouteLine = null;

// Cache DOM element references
const instruction = document.getElementById('instruction');
const rideControls = document.getElementById('ride-controls');
const requestBtn = document.getElementById('request-btn');
const resetBtn = document.getElementById('reset-btn');
const ridesList = document.getElementById('rides-list');
const logoutBtn = document.getElementById('logout-btn');
const searchInput = document.getElementById('location-search');
const searchBtn = document.getElementById('search-btn');
const searchResults = document.getElementById('search-results');
const rideLayersById = new Map();
let searchTimeout = null;

function removeRideFromMap(rideId) {
  const layers = rideLayersById.get(rideId);
  if (!layers) {
    return;
  }

  layers.forEach(layer => {
    if (layer && map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
  });

  rideLayersById.delete(rideId);
}

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

async function fetchRouteData(pickupLat, pickupLng, dropoffLat, dropoffLng) {
  const response = await fetch(`/api/route?pickupLat=${encodeURIComponent(pickupLat)}&pickupLng=${encodeURIComponent(pickupLng)}&dropoffLat=${encodeURIComponent(dropoffLat)}&dropoffLng=${encodeURIComponent(dropoffLng)}`, {
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error('Route request failed');
  }

  return response.json();
}

function clearCurrentRouteLine() {
  if (currentRouteLine) {
    map.removeLayer(currentRouteLine);
    currentRouteLine = null;
  }
}

function showRoutePreview(distanceKm, price) {
  instruction.innerHTML = `Ready! Click "Request Ride" to submit.<br>Distance: ${distanceKm.toFixed(1)} km<br>Price: R${price.toFixed(2)}`;
}

async function drawRouteBetweenPoints(pickupLat, pickupLng, dropoffLat, dropoffLng, { showDistance = false } = {}) {
  clearCurrentRouteLine();

  if (showDistance) {
    instruction.innerHTML = 'Ready! Click "Request Ride" to submit.<br>Calculating distance...';
  }

  try {
    const routeData = await fetchRouteData(pickupLat, pickupLng, dropoffLat, dropoffLng);
    const routeCoordinates = Array.isArray(routeData?.route) ? routeData.route.map(([lng, lat]) => [lat, lng]) : null;

    if (routeCoordinates && routeCoordinates.length > 0) {
      currentRouteLine = L.polyline(routeCoordinates, {
        color: '#7c3aed',
        weight: 4
      }).addTo(map);

      if (showDistance && typeof routeData.distanceKm === 'number' && typeof routeData.price === 'number') {
        showRoutePreview(routeData.distanceKm, routeData.price);
      }

      return currentRouteLine;
    }

    throw new Error('No route geometry received');
  } catch (err) {
    console.error('Error fetching route:', err);
    currentRouteLine = L.polyline([
      [pickupLat, pickupLng],
      [dropoffLat, dropoffLng]
    ], {
      color: '#7c3aed',
      weight: 2,
      dashArray: '5, 10'
    }).addTo(map);

    if (showDistance) {
      const fallbackDistance = 0;
      const fallbackPrice = 0;
      showRoutePreview(fallbackDistance, fallbackPrice);
    }

    return currentRouteLine;
  }
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

function clearSearchResults() {
  if (searchResults) {
    searchResults.innerHTML = '';
    searchResults.classList.add('hidden');
  }
}

function setMarkerAtLocation({ lat, lng, address, icon, label }) {
  const marker = L.marker([lat, lng], { icon }).addTo(map).bindPopup(`${label}: Looking up address...`).openPopup();
  marker.address = address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  marker.setPopupContent(`${label}: ${marker.address}`).openPopup();

  if (label === 'Pickup') {
    if (pickupMarker) map.removeLayer(pickupMarker);
    pickupMarker = marker;
    clickState = 'dropoff';
    instruction.textContent = 'Now click to set your dropoff location';
  } else {
    if (dropoffMarker) map.removeLayer(dropoffMarker);
    dropoffMarker = marker;
    clickState = 'done';
    rideControls.classList.remove('hidden');
    const pickupLatLng = pickupMarker.getLatLng();
    const dropoffLatLng = dropoffMarker.getLatLng();
    drawRouteBetweenPoints(pickupLatLng.lat, pickupLatLng.lng, dropoffLatLng.lat, dropoffLatLng.lng, { showDistance: true });
  }
}

async function searchLocations(query) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    clearSearchResults();
    return;
  }

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(trimmedQuery)}`, { credentials: 'include' });
    if (!response.ok) {
      throw new Error('Search request failed');
    }

    const results = await response.json();
    if (!searchResults) {
      return;
    }

    searchResults.innerHTML = '';
    if (!results.length) {
      searchResults.innerHTML = '<li>No results found.</li>';
      searchResults.classList.remove('hidden');
      return;
    }

    results.forEach(result => {
      const item = document.createElement('li');
      item.textContent = result.displayName;
      item.addEventListener('click', () => {
        clearSearchResults();
        searchInput.value = result.displayName;

        if (clickState === 'pickup') {
          setMarkerAtLocation({
            lat: Number(result.lat),
            lng: Number(result.lng),
            address: result.displayName,
            icon: greenIcon,
            label: 'Pickup'
          });
          return;
        }

        setMarkerAtLocation({
          lat: Number(result.lat),
          lng: Number(result.lng),
          address: result.displayName,
          icon: redIcon,
          label: 'Dropoff'
        });
      });
      searchResults.appendChild(item);
    });
    searchResults.classList.remove('hidden');
  } catch (err) {
    console.error('Error searching location:', err);
    if (searchResults) {
      searchResults.innerHTML = '<li>No results found.</li>';
      searchResults.classList.remove('hidden');
    }
  }
}

if (searchInput) {
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchLocations(searchInput.value);
    }, 400);
  });
}

if (searchBtn) {
  searchBtn.addEventListener('click', () => {
    searchLocations(searchInput.value);
  });
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
  clearSearchResults();
  if (clickState === 'pickup') {
    const pickupAddress = `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
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
        pickupMarker.address = pickupAddress;
        pickupMarker.setPopupContent(`Pickup: ${pickupAddress}`).openPopup();
        instruction.textContent = 'Now click to set your dropoff location';
        console.error('Error fetching pickup address:', err);
      });
  } else if (clickState === 'dropoff') {
    const dropoffAddress = `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
    if (dropoffMarker) map.removeLayer(dropoffMarker);
    dropoffMarker = L.marker(e.latlng, { icon: redIcon }).addTo(map).bindPopup('Dropoff: Looking up address...').openPopup();
    clickState = 'done';
    instruction.textContent = 'Looking up address...';
    rideControls.classList.remove('hidden');

    fetchAddress(e.latlng.lat, e.latlng.lng)
      .then(address => {
        dropoffMarker.address = address;
        dropoffMarker.setPopupContent(`Dropoff: ${address}`).openPopup();
        const pickupLatLng = pickupMarker.getLatLng();
        const dropoffLatLng = dropoffMarker.getLatLng();
        return drawRouteBetweenPoints(pickupLatLng.lat, pickupLatLng.lng, dropoffLatLng.lat, dropoffLatLng.lng, { showDistance: true });
      })
      .catch(err => {
        dropoffMarker.address = dropoffAddress;
        dropoffMarker.setPopupContent(`Dropoff: ${dropoffAddress}`).openPopup();
        const pickupLatLng = pickupMarker.getLatLng();
        const dropoffLatLng = dropoffMarker.getLatLng();
        drawRouteBetweenPoints(pickupLatLng.lat, pickupLatLng.lng, dropoffLatLng.lat, dropoffLatLng.lng, { showDistance: true });
        console.error('Error fetching dropoff address:', err);
      });
  }
});
// Remove both markers and reset state
function resetMarkers() {
  if (pickupMarker) map.removeLayer(pickupMarker);
  if (dropoffMarker) map.removeLayer(dropoffMarker);
  clearCurrentRouteLine();
  clearSearchResults();
  if (searchInput) {
    searchInput.value = '';
  }
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
  const distanceLabel = typeof ride.distanceKm === 'number' ? `${ride.distanceKm.toFixed(1)} km` : 'N/A';
  const priceLabel = typeof ride.price === 'number' ? `R${ride.price.toFixed(2)}` : 'N/A';

  const li = document.createElement('li');
  li.innerHTML = `
    <span class="status ${ride.status}">${ride.status}</span>
    Pickup: ${pickupLabel}<br>
    Dropoff: ${dropoffLabel}<br>
    Distance: ${distanceLabel}<br>
    Price: ${priceLabel}
  `;

  if (ride.status === 'completed') {
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', async () => {
      const shouldDelete = window.confirm('Delete this completed ride?');
      if (!shouldDelete) {
        return;
      }

      try {
        const response = await fetch(`/api/rides/${ride._id}`, {
          method: 'DELETE',
          credentials: 'include'
        });

        if (response.status === 401) {
          window.location.href = '/login.html';
          return;
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Could not delete ride');
        }

        li.remove();
        removeRideFromMap(ride._id);
      } catch (err) {
        console.error('Error deleting ride:', err);
      }
    });
    li.appendChild(deleteBtn);
  }

  ridesList.prepend(li);
}
async function addRideToMap(ride) {
  removeRideFromMap(ride._id);

  const rideLayers = [];

  const pickupLayer = L.circleMarker([ride.pickup.lat, ride.pickup.lng], {
    radius: 8,
    color: '#00d4aa',
    fillColor: '#00d4aa',
    fillOpacity: 0.7
  }).addTo(map).bindPopup('Pickup (Ride ' + ride._id.slice(-4) + ')');
  rideLayers.push(pickupLayer);

  const dropoffLayer = L.circleMarker([ride.dropoff.lat, ride.dropoff.lng], {
    radius: 8,
    color: '#e74c3c',
    fillColor: '#e74c3c',
    fillOpacity: 0.7
  }).addTo(map).bindPopup('Dropoff (Ride ' + ride._id.slice(-4) + ')');
  rideLayers.push(dropoffLayer);

  try {
    const routeData = await fetchRouteData(ride.pickup.lat, ride.pickup.lng, ride.dropoff.lat, ride.dropoff.lng);
    const routeCoordinates = Array.isArray(routeData?.route) ? routeData.route.map(([lng, lat]) => [lat, lng]) : null;

    if (routeCoordinates && routeCoordinates.length > 0) {
      const routeLayer = L.polyline(routeCoordinates, { color: '#7c3aed', weight: 4 }).addTo(map);
      rideLayers.push(routeLayer);
      rideLayersById.set(ride._id, rideLayers);
      return;
    }
  } catch (err) {
    console.error('Error fetching saved ride route:', err);
  }

  const fallbackRouteLayer = L.polyline([
    [ride.pickup.lat, ride.pickup.lng],
    [ride.dropoff.lat, ride.dropoff.lng]
  ], { color: '#7c3aed', weight: 2, dashArray: '5, 10' }).addTo(map);
  rideLayers.push(fallbackRouteLayer);
  rideLayersById.set(ride._id, rideLayers);
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
    await addRideToMap(savedRide);
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
    for (const ride of geocodedRides) {
      addRideToList(ride);
      await addRideToMap(ride);
    }
  } catch (err) {
    console.error('Error loading rides:', err);
  }
}

// Load rides as soon as the page opens
loadRides();