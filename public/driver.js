const driverRides = document.getElementById('driver-rides');

async function fetchAddress(lat, lng) {
  try {
    const response = await fetch(`/api/geocode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error('Geocode request failed');
    }
    const data = await response.json();
    return data.address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch (err) {
    console.error('Error fetching address:', err);
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

async function loadPendingRides() {
  try {
    const response = await fetch('/api/rides', { credentials: 'include' });
    if (response.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    const rides = await response.json();
    const activeRides = rides.filter(r => r.status !== 'completed');
    if (activeRides.length === 0) {
      driverRides.innerHTML = '<p class="no-rides">No rides available right now.</p>';
      return;
    }
    driverRides.innerHTML = '';
    const pendingRenderPromises = activeRides.map(async ride => {
      const card = document.createElement('div');
      card.className = 'ride-card';
      card.innerHTML = `
        <div class="coords">
          <strong>Pickup:</strong> Loading address...<br>
          <strong>Dropoff:</strong> Loading address...
        </div>
        <span class="status ${ride.status}">${ride.status}</span>
        ${ride.status === 'pending' ? `<button class="accept-btn" onclick="updateRide('${ride._id}', 'accepted')">Accept</button>` : ''}
        ${ride.status === 'accepted' ? `<button class="complete-btn" onclick="updateRide('${ride._id}', 'completed')">Complete</button>` : ''}
      `;
      driverRides.appendChild(card);

      const coordsDiv = card.querySelector('.coords');
      const [pickupAddress, dropoffAddress] = await Promise.all([
        fetchAddress(ride.pickup.lat, ride.pickup.lng),
        fetchAddress(ride.dropoff.lat, ride.dropoff.lng)
      ]);

      coordsDiv.innerHTML = `
        <strong>Pickup:</strong> ${pickupAddress}<br>
        <strong>Dropoff:</strong> ${dropoffAddress}
      `;
    });

    await Promise.all(pendingRenderPromises);
  } catch (err) {
    console.error('Error loading rides:', err);
  }
}
async function updateRide(id, status) {
  try {
    const response = await fetch(`/api/rides/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status })
    });

    if (response.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    loadPendingRides();
  } catch (err) {
    console.error('Error updating ride:', err);
  }
}

const logoutBtn = document.getElementById('logout-btn');

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

loadPendingRides();
setInterval(loadPendingRides, 5000);