// ----------------------
// Manual UPI Payment Logic
// ----------------------

const API_BASE_URL = window.location.hostname === '127.0.0.1' ? 'http://127.0.0.1:5000' : 'http://localhost:5000';
const USER_ID_KEYS = ['sbme_user_id', 'sbme_current_user_id', 'userId'];
const TOKEN_KEYS = ['authToken', 'token', 'jwt', 'accessToken'];

function getFirstLocalStorageValue(keys) {
    for (const key of keys) {
        const value = window.localStorage.getItem(key);
        if (value) return value;
    }
    return null;
}

document.addEventListener('DOMContentLoaded', () => {
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
    const userId = getFirstLocalStorageValue(USER_ID_KEYS);

    // Validate params
    if (!plan || !amount || !action || !userId) {
        alert('Invalid payment session. Redirecting to profile.');
        window.location.href = 'profile.html';
        return;
    }

    // Set UI Details
    document.getElementById('displayPlan').textContent = plan;
    document.getElementById('displayAmount').textContent = `₹${amount}`;
    document.getElementById('displayUserId').textContent = userId;

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
        statusDiv.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
    }

    paidBtn.addEventListener('click', () => {
        if (timeLeft <= 0) return;

        // Validate Transaction ID is not empty before showing modal
        const tid = txInput.value.trim();
        if (!tid) {
            alert("Please enter your UPI Transaction ID before confirming.");
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
            const response = await fetch(`${API_BASE_URL}/api/verify-payment`, {
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
            setStatus('success', data.message || 'Payment logged successfully!');
            paidBtn.style.display = 'none';

            // Redirect after a brief moment to see success msg
            setTimeout(() => {
                window.location.href = 'profile.html';
            }, 3000);

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

});
