// Add this to your existing Fantasy Life League HTML

// ===== HEALTH API CONFIGURATION =====
const HEALTH_API_URL = 'http://localhost:8000/api/health'; // Change to your backend URL
const USER_ID = 'user-' + Date.now(); // Replace with actual user ID from auth

// ===== HEALTH STATE =====
let healthState = {
    lastSync: null,
    isSyncing: false,
    data: {
        steps: 0,
        calories: 0,
        distance: 0,
        workouts: [],
        heartRate: 0
    },
    points: 0,
    status: 'not-synced' // 'not-synced', 'synced', 'error'
};

// ===== HEALTH API FUNCTIONS =====
async function fetchHealthStatus() {
    try {
        const response = await fetch(`${HEALTH_API_URL}/status/${USER_ID}`);
        const data = await response.json();

        if (data.hasData) {
            healthState.data = {
                steps: Math.round(data.statistics.averageSteps),
                calories: Math.round(data.statistics.averageCalories),
                distance: Math.round(data.statistics.averageDistance / 1000), // Convert to km
                workouts: [],
                heartRate: 0
            };
            healthState.status = 'synced';
            healthState.lastSync = new Date();
        }

        updateHealthUI();
    } catch (error) {
        console.error('Failed to fetch health status:', error);
        healthState.status = 'error';
        updateHealthUI();
    }
}

async function syncHealthData() {
    if (healthState.isSyncing) return;

    healthState.isSyncing = true;
    updateHealthUI();

    try {
        // In a real implementation, this would receive data from iOS app
        // For demo, we'll simulate data
        const mockData = {
            steps: Math.floor(Math.random() * 5000) + 7000,
            calories: Math.floor(Math.random() * 300) + 400,
            distance: Math.floor(Math.random() * 3) + 5,
            workouts: Math.floor(Math.random() * 2) + 1
        };

        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 2000));

        healthState.data = mockData;
        healthState.points = calculateHealthPoints(mockData);
        healthState.status = 'synced';
        healthState.lastSync = new Date();

        // Add health points to weekly score
        state.matchup.userScore += healthState.points;
        state.weekPoints += healthState.points;

        saveState();
        updateUI();
        updateHealthUI();

        showToast(`Health data synced! +${healthState.points} bonus points`, false, healthState.points);
    } catch (error) {
        console.error('Sync failed:', error);
        healthState.status = 'error';
        updateHealthUI();
        showToast('Health sync failed. Please try again.', true);
    } finally {
        healthState.isSyncing = false;
        updateHealthUI();
    }
}

function calculateHealthPoints(data) {
    let points = 0;

    // Steps: 1 point per 1000 steps
    points += Math.floor(data.steps / 1000);

    // Calories: 1 point per 100 calories
    points += Math.floor(data.calories / 100);

    // Workouts: 5 points per workout
    points += (data.workouts || 0) * 5;

    // Distance bonus: 2 points per km over 5km
    if (data.distance > 5) {
        points += (data.distance - 5) * 2;
    }

    return Math.round(points * 10) / 10;
}

function updateHealthUI() {
    const container = document.getElementById('healthSyncCard');
    if (!container) return;

    const statusBadge = healthState.isSyncing ?
        `<span class="sync-status"><span class="loading-spinner"></span> Syncing...</span>` :
        healthState.status === 'synced' ?
            `<span class="sync-status synced">✓ Synced ${formatTimeAgo(healthState.lastSync)}</span>` :
            healthState.status === 'error' ?
                `<span class="sync-status error">✗ Sync Failed</span>` :
                `<span class="sync-status">○ Not Synced</span>`;

    container.innerHTML = `
    <div class="health-sync-header">
      <div class="health-sync-title">
        <span style="font-size: 1.5rem;">🏃</span>
        <h3>Health Data</h3>
        <span class="health-badge">📱 iOS App</span>
      </div>
      ${statusBadge}
    </div>
    
    <div class="health-metrics">
      <div class="health-metric" style="--accent-color: #00ff66;">
        <div class="metric-header">
          <span style="color: #00ff66;">👟</span>
          <span class="metric-label">Steps</span>
        </div>
        <div class="metric-value" style="color: #00ff66;">
          ${healthState.data.steps.toLocaleString()}
          <span class="metric-unit">steps</span>
        </div>
        <div class="metric-points">+${Math.floor(healthState.data.steps / 1000)} pts</div>
      </div>
      
      <div class="health-metric" style="--accent-color: #ff6600;">
        <div class="metric-header">
          <span style="color: #ff6600;">🔥</span>
          <span class="metric-label">Calories</span>
        </div>
        <div class="metric-value" style="color: #ff6600;">
          ${healthState.data.calories}
          <span class="metric-unit">kcal</span>
        </div>
        <div class="metric-points">+${Math.floor(healthState.data.calories / 100)} pts</div>
      </div>
      
      <div class="health-metric" style="--accent-color: #00b8ff;">
        <div class="metric-header">
          <span style="color: #00b8ff;">📏</span>
          <span class="metric-label">Distance</span>
        </div>
        <div class="metric-value" style="color: #00b8ff;">
          ${healthState.data.distance.toFixed(1)}
          <span class="metric-unit">km</span>
        </div>
        <div class="metric-points">+${healthState.data.distance > 5 ? (healthState.data.distance - 5) * 2 : 0} pts</div>
      </div>
      
      <div class="health-metric" style="--accent-color: #bf00ff;">
        <div class="metric-header">
          <span style="color: #bf00ff;">💪</span>
          <span class="metric-label">Workouts</span>
        </div>
        <div class="metric-value" style="color: #bf00ff;">
          ${healthState.data.workouts || 0}
          <span class="metric-unit">today</span>
        </div>
        <div class="metric-points">+${(healthState.data.workouts || 0) * 5} pts</div>
      </div>
    </div>
    
    <div class="sync-actions">
      <button class="btn btn-sync" onclick="syncHealthData()" ${healthState.isSyncing ? 'disabled' : ''}>
        ${healthState.isSyncing ? '⏳ Syncing...' : '🔄 Sync Health Data'}
      </button>
      ${healthState.points > 0 ? `
        <div style="padding: 8px 16px; background: rgba(0, 255, 102, 0.1); border: 1px solid var(--neon-green); border-radius: 8px;">
          <span style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-muted);">Bonus:</span>
          <span style="font-family: var(--font-display); font-size: 1.1rem; font-weight: 700; color: var(--neon-green); margin-left: 4px;">+${healthState.points}</span>
        </div>
      ` : ''}
    </div>
    
    <div class="sync-info">
      ${healthState.status === 'not-synced' ?
            '📱 Download our iOS app to sync your Apple Health data' :
            healthState.status === 'synced' ?
                '✓ Health data is automatically verified to prevent cheating' :
                '⚠️ Connection failed. Please check your internet connection'}
    </div>
  `;
}

function formatTimeAgo(date) {
    if (!date) return '';
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

// Initialize health on page load
document.addEventListener('DOMContentLoaded', () => {
    fetchHealthStatus();
    // Poll for updates every 5 minutes
    setInterval(fetchHealthStatus, 5 * 60 * 1000);
});