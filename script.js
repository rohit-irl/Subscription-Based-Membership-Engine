document.addEventListener('DOMContentLoaded', () => {
    // 1. Billing Toggle Logic
    const billingToggle = document.getElementById('billingToggle');
    const priceAmounts = document.querySelectorAll('.amount');
    const durationTexts = document.querySelectorAll('.duration');

    billingToggle.addEventListener('change', () => {
        priceAmounts.forEach(amount => {
            const monthly = amount.getAttribute('data-monthly');
            const yearly = amount.getAttribute('data-yearly');
            
            if (billingToggle.checked) {
                // Yearly
                animateValue(amount, parseInt(monthly), parseInt(yearly), 300);
            } else {
                // Monthly
                animateValue(amount, parseInt(yearly), parseInt(monthly), 300);
            }
        });

        durationTexts.forEach(text => {
            text.textContent = billingToggle.checked ? '/yr' : '/mo';
        });
    });

    // Simple number animation function
    function animateValue(obj, start, end, duration) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            obj.innerHTML = Math.floor(progress * (end - start) + start);
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }

    // 2. Modal Logic
    const authModal = document.getElementById('authModal');
    const loginBtn = document.getElementById('loginBtn');
    const signupBtn = document.getElementById('signupBtn');
    const closeBtn = document.querySelector('.close-modal');
    const toggleAuth = document.getElementById('toggleAuth');
    const modalTitle = document.getElementById('modalTitle');
    const modalSubtitle = document.getElementById('modalSubtitle');
    const authForm = document.getElementById('authForm');

    const openModal = (mode) => {
        authModal.style.display = 'flex';
        document.body.style.overflow = 'hidden'; // Prevent scroll
        
        if (mode === 'signup') {
            modalTitle.textContent = 'Create Account';
            modalSubtitle.textContent = 'Start your 14-day free trial today.';
            toggleAuth.innerHTML = 'Log in';
        } else {
            modalTitle.textContent = 'Log In';
            modalSubtitle.textContent = 'Access your account to manage your subscription.';
            toggleAuth.innerHTML = 'Sign up';
        }
    };

    const closeModal = () => {
        authModal.style.display = 'none';
        document.body.style.overflow = 'auto';
    };

    loginBtn.addEventListener('click', () => openModal('login'));
    signupBtn.addEventListener('click', () => openModal('signup'));
    closeBtn.addEventListener('click', closeModal);

    // Close modal on click outside
    window.addEventListener('click', (e) => {
        if (e.target === authModal) closeModal();
    });

    toggleAuth.addEventListener('click', (e) => {
        e.preventDefault();
        const isLogin = modalTitle.textContent === 'Log In';
        openModal(isLogin ? 'signup' : 'login');
    });

    authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        alert('Authentication successful! (Demo Only)');
        closeModal();
    });

    // 3. Smooth Scroll for Links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });
});
