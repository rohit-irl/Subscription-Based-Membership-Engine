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

    // Update Avatar Image with name or custom image
    const profileImage = document.getElementById('profileImage');
    if (profileImage) {
      if (profile.profile_image) {
        profileImage.src = `${API_BASE_URL}${profile.profile_image}`;
      } else if (profile.name) {
        profileImage.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&background=10b981&color=fff&size=120`;
      }
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

// Edit Profile Logic
function bindEditProfile() {
  const editBtn = document.getElementById('editProfileBtn');
  const modal = document.getElementById('editProfileModal');
  const closeBtn = document.getElementById('closeEditModal');
  const form = document.getElementById('editProfileForm');

  if (!editBtn || !modal || !closeBtn || !form) return;
  if (editBtn.dataset.bound) return;

  editBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const currentName = document.getElementById('profileName').textContent;
    const currentEmail = document.getElementById('profileEmail').textContent;
    document.getElementById('editName').value = currentName === '—' ? '' : currentName;
    document.getElementById('editEmail').value = currentEmail === '—' ? '' : currentEmail;
    modal.classList.add('show');
  });

  closeBtn.addEventListener('click', () => {
    modal.classList.remove('show');
  });

  window.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('show');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Saving...';
    submitBtn.disabled = true;

    const newName = document.getElementById('editName').value.trim();
    const newEmail = document.getElementById('editEmail').value.trim();

    try {
      // Send PUT request to backend
      const response = await fetch(`${API_BASE_URL}/api/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getFirstLocalStorageValue(TOKEN_KEYS)}`
        },
        body: JSON.stringify({ name: newName, email: newEmail })
      });

      if (!response.ok) {
        // If 404 (backend not implemented), we simulate success as per prompt
        if (response.status !== 404) {
          throw new Error('Failed to update profile');
        }
      }

      // Update UI dynamically
      setText('profileName', newName);
      setText('profileEmail', newEmail);

      const profileImage = document.getElementById('profileImage');
      if (profileImage && !profileImage.src.includes('/uploads/') && newName) {
        profileImage.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(newName)}&background=10b981&color=fff&size=120`;
      }

      setStatus('success', 'Profile updated successfully.');
      modal.classList.remove('show');
    } catch (error) {
      setStatus('error', error.message || 'Error updating profile');
    } finally {
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }
  });

  editBtn.dataset.bound = '1';
}

// Upgrade Plan Logic
function bindUpgradePlan() {
  const upgradeBtn = document.getElementById('upgradeBtn');
  const modal = document.getElementById('upgradePlanModal');
  const closeBtn = document.getElementById('closeUpgradeModal');
  const form = document.getElementById('upgradePlanForm');

  if (!upgradeBtn || !modal || !closeBtn || !form) return;
  if (upgradeBtn.dataset.bound) return;

  upgradeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    modal.classList.add('show');
  });

  closeBtn.addEventListener('click', () => {
    modal.classList.remove('show');
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const selectedPlan = document.getElementById('planSelect').value;

    let amount = 1900;
    if (selectedPlan === 'Pro') amount = 4900;
    if (selectedPlan === 'Premium') amount = 9900;

    // Redirect to custom Payment Page
    window.location.href = `payment.html?action=upgrade&plan=${encodeURIComponent(selectedPlan)}&amount=${amount}`;
  });

  upgradeBtn.dataset.bound = '1';
}

// Renew Subscription Logic
function bindRenewSubscription() {
  const renewBtn = document.getElementById('renewBtn');
  if (!renewBtn || renewBtn.dataset.bound) return;

  renewBtn.addEventListener('click', (e) => {
    e.preventDefault();

    const amount = 999;
    const currentPlan = document.getElementById('profilePlan').textContent || 'Free';

    // Redirect to custom Payment Page
    window.location.href = `payment.html?action=renew&plan=${encodeURIComponent(currentPlan)}&amount=${amount}`;
  });

  renewBtn.dataset.bound = '1';
}

// Profile Image Upload Logic
function bindImageUpload() {
  const fileInput = document.getElementById('profileImageInput');
  const profileImage = document.getElementById('profileImage');
  if (!fileInput || !profileImage || fileInput.dataset.bound) return;

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Preview image instantly
    const reader = new FileReader();
    reader.onload = (event) => {
      profileImage.src = event.target.result;
    };
    reader.readAsDataURL(file);

    setStatus('info', 'Uploading image...');

    try {
      const formData = new FormData();
      formData.append('avatar', file);
      formData.append('userId', getFirstLocalStorageValue(USER_ID_KEYS) || '1');

      // Upload to backend via FormData
      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getFirstLocalStorageValue(TOKEN_KEYS)}`
        },
        body: formData
      });

      const responseData = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(responseData.message || 'Image upload failed');
      }

      // Update UI after success
      if (responseData.profile_image) {
        profileImage.src = `${API_BASE_URL}${responseData.profile_image}`;
      }
      setStatus('success', 'Profile image updated successfully.');
    } catch (error) {
      setStatus('error', error.message || 'Error uploading image');
    }
  });

  fileInput.dataset.bound = '1';
}

// Change Password / Manage Security
function bindChangePassword() {
  const manageBtn = document.getElementById('manageSecurityBtn');
  const modal = document.getElementById('changePasswordModal');
  const closeBtn = document.getElementById('closeChangePasswordModal');
  const cancelBtn = document.getElementById('cancelChangePassword');
  const form = document.getElementById('changePasswordForm');
  const errorEl = document.getElementById('changePasswordError');
  const successEl = document.getElementById('changePasswordSuccess');
  const submitBtn = document.getElementById('changePasswordSubmit');
  const spinner = document.getElementById('changePasswordSpinner');

  if (!manageBtn || !modal || !closeBtn || !cancelBtn || !form || !errorEl || !successEl || !submitBtn || !spinner) return;
  if (manageBtn.dataset.bound === '1') return;

  function resetMessages() {
    errorEl.textContent = '';
    successEl.textContent = '';
  }

  function closeModal() {
    modal.classList.remove('show');
    resetMessages();
    form.reset();
    submitBtn.disabled = false;
    spinner.classList.add('hidden');
  }

  manageBtn.addEventListener('click', (e) => {
    e.preventDefault();
    resetMessages();
    modal.classList.add('show');
  });

  closeBtn.addEventListener('click', () => {
    closeModal();
  });

  cancelBtn.addEventListener('click', () => {
    closeModal();
  });

  window.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Toggle password visibility (eye icon)
  const toggles = modal.querySelectorAll('.password-toggle');
  toggles.forEach((btn) => {
    if (!btn || btn.dataset.bound === '1') return;
    const targetId = btn.getAttribute('data-target');
    const input = targetId ? document.getElementById(targetId) : null;
    if (!input) return;

    btn.addEventListener('click', () => {
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      const icon = btn.querySelector('i');
      if (icon) {
        icon.classList.toggle('fa-eye', !isHidden);
        icon.classList.toggle('fa-eye-slash', isHidden);
      }
    });

    btn.dataset.bound = '1';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    resetMessages();

    const currentPassword = document.getElementById('currentPassword').value.trim();
    const newPassword = document.getElementById('newPassword').value.trim();
    const confirmPassword = document.getElementById('confirmPassword').value.trim();

    if (!currentPassword || !newPassword || !confirmPassword) {
      errorEl.textContent = 'All fields are required.';
      return;
    }

    if (newPassword.length < 8) {
      errorEl.textContent = 'New password must be at least 8 characters.';
      return;
    }

    if (newPassword !== confirmPassword) {
      errorEl.textContent = 'New password and confirmation do not match.';
      return;
    }

    const token = getFirstLocalStorageValue(TOKEN_KEYS);
    if (!token) {
      errorEl.textContent = 'You are not logged in. Please login again.';
      return;
    }

    submitBtn.disabled = true;
    spinner.classList.remove('hidden');

    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = data && data.message ? data.message : 'Failed to update password.';
        throw new Error(message);
      }

      successEl.textContent = data.message || 'Password updated successfully.';
      setStatus('success', successEl.textContent);

      setTimeout(() => {
        closeModal();
      }, 1200);
    } catch (err) {
      console.error('Change password failed:', err);
      let message = err && err.message ? err.message : 'Failed to update password.';
      if (message === 'Failed to fetch') {
        message = `Cannot reach backend at ${API_BASE_URL}. Please ensure the backend is running and CORS/methods allow PUT requests.`;
      }
      errorEl.textContent = message;
      setStatus('error', message);
    } finally {
      submitBtn.disabled = false;
      spinner.classList.add('hidden');
    }
  });

  manageBtn.dataset.bound = '1';
}

document.addEventListener('DOMContentLoaded', () => {
  bindLogout();
  bindEditProfile();
  bindUpgradePlan();
  bindRenewSubscription();
  bindImageUpload();
  bindChangePassword();
  loadProfile();
});

