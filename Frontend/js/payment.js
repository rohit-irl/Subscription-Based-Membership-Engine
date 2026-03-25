// ----------------------
// Manual UPI Payment Logic
// ----------------------

// NOTE: `API_BASE_URL` is already declared in `js/script.js` (loaded before this file).
// Redeclaring it here breaks the whole script. We use a unique variable instead.
const PAYMENT_API_BASE_URL =
    typeof API_BASE_URL !== 'undefined'
        ? API_BASE_URL
        : window.location.hostname === '127.0.0.1'
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

async function initPaymentPage() {
    // Check auth
    const token = getFirstLocalStorageValue(TOKEN_KEYS);
    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // Parse URL Params
    const urlParams = new URLSearchParams(window.location.search);
    const plan = urlParams.get('plan');
    const amount = urlParams.get('amount');
    const action = urlParams.get('action');

    // Validate params (userId is not required for backend verification, only for display)
    if (!plan || !amount || !action) {
        alert('Invalid payment session. Redirecting to profile.');
        window.location.href = 'profile.html';
        return;
    }

    // Set UI Details early
    const displayPlanEl = document.getElementById('displayPlan');
    const displayAmountEl = document.getElementById('displayAmount');
    const displayUserIdEl = document.getElementById('displayUserId');

    if (displayPlanEl) displayPlanEl.textContent = plan;
    if (displayAmountEl) displayAmountEl.textContent = `₹${amount}`;

    // Resolve userId for display (localStorage first, else /api/profile)
    // Important: do not block timer/rendering on this network call.
    let userId = getFirstLocalStorageValue(USER_ID_KEYS);
    if (displayUserIdEl) {
        displayUserIdEl.textContent = userId || '--';
    }

    if (!userId && displayUserIdEl) {
            fetch(`${PAYMENT_API_BASE_URL}/api/profile`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            credentials: 'include'
        })
            .then((r) => r.json().catch(() => ({})))
            .then((profileData) => {
                if (profileData && profileData.id) {
                    displayUserIdEl.textContent = String(profileData.id);
                }
            })
            .catch(() => {
                // ignore; payment page can still function
            });
    }

    // Copy UPI ID functionality
    const copyBtn = document.getElementById('copyBtn');
    const upiText = document.getElementById('upiIdText').textContent;

    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(upiText).then(() => {
            const originalHtml = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied';
            copyBtn.style.background = 'var(--primary-color)';
            copyBtn.style.color = 'white';

            setTimeout(() => {
                copyBtn.innerHTML = originalHtml;
                copyBtn.style.background = 'transparent';
                copyBtn.style.color = 'var(--primary-color)';
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    });

    // ----------------------
    // 2-Minute Countdown Timer
    // ----------------------
    let timeLeft = 120; // 120 seconds
    const timerEl = document.getElementById('countdownTimer');
    const paidBtn = document.getElementById('iHavePaidBtn');
    const expiredMsg = document.getElementById('expiredMessage');
    let timerInterval;

    function updateTimer() {
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            timerEl.textContent = "00:00";

            // Handle Timeout
            paidBtn.disabled = true;
            paidBtn.style.opacity = '0.5';
            expiredMsg.style.display = 'block';

            // Redirect after 3 seconds
            setTimeout(() => {
                window.location.href = 'profile.html';
            }, 3000);
            return;
        }

        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        if (timeLeft < 30 && !timerEl.classList.contains('warning')) {
            timerEl.classList.add('warning');
        }

        timeLeft--;
    }

    // Start timer immediately
    updateTimer();
    timerInterval = setInterval(updateTimer, 1000);


    // ----------------------
    // Modal & Verification Logic
    // ----------------------
    const modal = document.getElementById('confirmModal');
    const cancelBtn = document.getElementById('cancelConfirmBtn');
    const yesBtn = document.getElementById('yesConfirmBtn');
    const statusDiv = document.getElementById('paymentStatus');
    const txInput = document.getElementById('transactionId');

    function setStatus(type, msg) {
        const safeMsg = msg == null ? '' : String(msg);
        const cls =
            type === 'success' ? 'text-success' : type === 'error' ? 'text-danger' : 'text-muted';
        const icon =
            type === 'success'
                ? '<i class="fas fa-check-circle" aria-hidden="true"></i>'
                : type === 'error'
                    ? '<i class="fas fa-exclamation-circle" aria-hidden="true"></i>'
                    : '<i class="fas fa-info-circle" aria-hidden="true"></i>';

        statusDiv.innerHTML =
            `<div role="status" aria-live="polite" class="payment-toast" data-type="${type}">${icon}<span class="${cls}">${safeMsg}</span></div>`;
    }

    paidBtn.addEventListener('click', () => {
        if (timeLeft <= 0) return;

        statusDiv.innerHTML = ''; // clear previous alerts

        // Validate Transaction ID is not empty before showing modal
        const tid = txInput.value.trim();
        if (!tid) {
            setStatus('error', "Please enter your UPI Transaction ID before confirming.");
            txInput.focus();
            return;
        }

        // Validate Transaction ID format
        if (tid.length < 8 || !/^[a-zA-Z0-9]+$/.test(tid)) {
            setStatus('error', "Invalid Transaction ID format. It should be alphanumeric and at least 8 characters long.");
            txInput.focus();
            return;
        }

        modal.classList.add('show');
    });

    cancelBtn.addEventListener('click', () => {
        modal.classList.remove('show');
    });

    yesBtn.addEventListener('click', async () => {
        yesBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        yesBtn.disabled = true;
        cancelBtn.disabled = true;

        clearInterval(timerInterval); // Stop timer while processing

        const tid = txInput.value.trim();

        try {
            const response = await fetch(`${PAYMENT_API_BASE_URL}/api/verify-payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    plan,
                    amount: parseInt(amount, 10),
                    action,
                    paymentMethod: 'UPI',
                    transactionId: tid
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Payment submission failed');
            }

            // Success logic
            modal.classList.remove('show');
            setStatus('success', data.message || 'Payment Successful ✅');
            paidBtn.style.display = 'none';
            txInput.disabled = true;

            // Redirect after a brief moment to see success toast
            setTimeout(() => {
                window.location.href = 'profile.html';
            }, 5000);

        } catch (error) {
            modal.classList.remove('show');
            setStatus('error', error.message);

            // Resume timer if failed
            yesBtn.innerHTML = 'Yes, I Paid';
            yesBtn.disabled = false;
            cancelBtn.disabled = false;
            timerInterval = setInterval(updateTimer, 1000);
        }
    });

}

// Ensure init runs even if DOMContentLoaded has already fired.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initPaymentPage();
    });
} else {
    initPaymentPage();
}
