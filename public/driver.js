const driverRides = document.getElementById('driver-rides');

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
    activeRides.forEach(ride => {
      const card = document.createElement('div');
      card.className = 'ride-card';
      card.innerHTML = `
        <div class="coords">
          <strong>Pickup:</strong> ${ride.pickup.lat.toFixed(4)}, ${ride.pickup.lng.toFixed(4)}<br>
          <strong>Dropoff:</strong> ${ride.dropoff.lat.toFixed(4)}, ${ride.dropoff.lng.toFixed(4)}
        </div>
        <span class="status ${ride.status}">${ride.status}</span>
        ${ride.status === 'pending' ? `<button class="accept-btn" onclick="updateRide('${ride._id}', 'accepted')">Accept</button>` : ''}
        ${ride.status === 'accepted' ? `<button class="complete-btn" onclick="updateRide('${ride._id}', 'completed')">Complete</button>` : ''}
      `;
      driverRides.appendChild(card);
    });
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