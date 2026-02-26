const API_BASE_URL =
  window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:5000'
    : 'http://localhost:5000';

const USER_ID_KEYS = ['sbme_user_id', 'sbme_current_user_id', 'userId'];
const TOKEN_KEYS = ['authToken', 'token', 'jwt', 'accessToken'];

function getFirstLocalStorageValue(keys) {
  for (const key of keys) {
    const value = window.localStorage.getItem(key);
    if (value) return value;
  }
  return null;
}

function clearAuthStorage() {
  for (const key of USER_ID_KEYS) window.localStorage.removeItem(key);
  for (const key of TOKEN_KEYS) window.localStorage.removeItem(key);
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value == null || value === '' ? '—' : String(value);
}

function setStatus(type, message) {
  const el = document.getElementById('profileStatus');
  if (!el) return;

  el.textContent = message || '';
  el.style.color =
    type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '';
}

function formatExpiry(expiryDate) {
  if (!expiryDate) return 'No Active Subscription';

  const date = new Date(expiryDate);
  if (Number.isNaN(date.getTime())) return String(expiryDate);

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  });
}

async function apiRequest(path, { method = 'GET' } = {}) {
  const token = getFirstLocalStorageValue(TOKEN_KEYS);

  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeoutMs = 12000;
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      mode: 'cors',
      credentials: 'include', // supports session auth if you use it
      signal: controller.signal,
      headers
    });
  } catch (error) {
    console.error('Network error:', error);
    const isTimeout = error && error.name === 'AbortError';
    const isOn127 = window.location && window.location.hostname === '127.0.0.1';
    const hint = isOn127
      ? 'If this is CORS-related, open the frontend via http://localhost:5500 (not 127.0.0.1).'
      : 'If this is CORS-related, ensure the backend allows your Origin and headers.';

    const msg = isTimeout
      ? `Request timed out after ${Math.round(timeoutMs / 1000)}s. Is the backend running at ${API_BASE_URL}?`
      : `Cannot reach backend at ${API_BASE_URL}. ${hint}`;

    throw new Error(msg);
  } finally {
    window.clearTimeout(timeoutId);
  }

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  if (!response.ok) {
    const message =
      data && data.message ? data.message : `Request failed (${response.status})`;
    const err = new Error(message);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

function bindLogout() {
  const btn = document.getElementById('logoutBtn');
  if (!btn || btn.dataset.bound === '1') return;

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!confirm('Are you sure you want to logout?')) return;

    try {
      await apiRequest('/api/logout', { method: 'POST' });
    } catch (error) {
      // Even if server logout fails, we still clear client-side auth
      console.warn('Logout request failed:', error);
    } finally {
      clearAuthStorage();
      window.location.href = 'login.html';
    }
  });

  btn.dataset.bound = '1';
}

async function loadProfile() {
  // Page is protected; if user isn't logged in, send them away.
  setStatus('info', 'Loading your profile...');

  try {
    const profile = await apiRequest('/api/profile');

    // Basic Account Details
    setText('profileName', profile.name || 'User');
    setText('profileEmail', profile.email || 'Not available');
    setText('profileId', profile.id || `USR-${Math.floor(10000 + Math.random() * 90000)}`);
    
    // Update Avatar Image with name
    const profileImage = document.getElementById('profileImage');
    if (profileImage && profile.name) {
      profileImage.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&background=10b981&color=fff&size=120`;
    }

    // Subscription & Plan Details
    setText('profilePlan', profile.plan_name || 'Free Plan');
    setText('profileExpiry', formatExpiry(profile.expiry_date));
    setText('profileDownloadsUsed', profile.downloads_used ?? 0);

    if (profile.download_limit == null) {
      setText('profileDownloadLimit', '—');
    } else {
      setText('profileDownloadLimit', profile.download_limit);
    }

    // Calculate Remaining Days and Update Badge/Progress
    let remainingDays = 0;
    const badge = document.getElementById('subscriptionBadge');
    const progressBar = document.getElementById('subscriptionProgress');

    if (profile.expiry_date) {
      const today = new Date();
      const expDate = new Date(profile.expiry_date);
      const diffTime = expDate - today;
      remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    if (remainingDays > 0) {
      setText('profileRemainingDays', `${remainingDays} Day${remainingDays !== 1 ? 's' : ''}`);
      if (badge) {
        badge.textContent = 'Active';
        badge.className = 'badge badge-success';
      }
      
      // Assume a 30-day billing cycle for progress representation, cap at 100%
      let progressPercent = (remainingDays / 30) * 100;
      if (progressPercent > 100) progressPercent = 100;
      if (progressBar) {
        progressBar.style.width = `${progressPercent}%`;
      }
    } else {
      setText('profileRemainingDays', '0 Days');
      if (badge) {
        badge.textContent = 'Expired';
        badge.className = 'badge badge-danger';
      }
      if (progressBar) {
        progressBar.style.width = '0%';
        progressBar.style.background = '#ef4444'; // Red color for expired progress
      }
    }

    setStatus('success', '');
  } catch (error) {
    console.error('Profile load failed:', error);

    if (error && (error.status === 401 || error.status === 403)) {
      clearAuthStorage();
      window.location.href = 'login.html';
      return;
    }

    setStatus('error', error.message || 'Failed to load profile.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindLogout();
  loadProfile();
});

