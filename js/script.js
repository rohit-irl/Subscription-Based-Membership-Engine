/**
 * SparkEngine - Global JavaScript
 * Handles: Pricing Toggle, Form Validation, Navigation, Animations
 */

document.addEventListener('DOMContentLoaded', () => {

    // 1. Billing Toggle (Pricing Page Only)
    const billingToggle = document.getElementById('billingToggle');
    if (billingToggle) {
        const prices = document.querySelectorAll('.amount');
        const durationLabels = document.querySelectorAll('.duration');

        billingToggle.addEventListener('change', () => {
            prices.forEach(price => {
                const monthly = price.dataset.monthly;
                const yearly = price.dataset.yearly;

                // Animate value change
                animateNumber(price, parseInt(billingToggle.checked ? monthly : yearly), parseInt(billingToggle.checked ? yearly : monthly), 400);
            });

            durationLabels.forEach(label => {
                label.textContent = billingToggle.checked ? '/yr' : '/mo';
            });
        });
    }

    // 2. Form Validation (Login/Signup Pages)
    const authForm = document.getElementById('authForm');
    if (authForm) {
        authForm.addEventListener('submit', (e) => {
            e.preventDefault();
            let isValid = true;
            const inputs = authForm.querySelectorAll('input[required]');

            inputs.forEach(input => {
                if (!input.value.trim()) {
                    isValid = false;
                    highlightInput(input);
                } else {
                    resetInput(input);
                }
            });

            if (isValid) {
                // Simulate success and redirect
                const target = authForm.dataset.redirect || 'dashboard.html';
                console.log('Form validated successfully. Redirecting to:', target);

                // Show loading state on button
                const btn = authForm.querySelector('button[type="submit"]');
                const originalText = btn.textContent;
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

                setTimeout(() => {
                    window.location.href = target;
                }, 1000);
            }
        });
    }

    // 3. Helper: Animate Number Change
    function animateNumber(element, start, end, duration) {
        let startTime = null;
        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            element.textContent = Math.floor(progress * (end - start) + start);
            if (progress < 1) {
                requestAnimationFrame(step);
            }
        }
        requestAnimationFrame(step);
    }

    // 4. Helper: Highlight Invalid Input
    function highlightInput(input) {
        input.style.borderColor = '#ef4444';
        input.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.1)';

        // Add error shake animation
        input.classList.add('error-shake');
        setTimeout(() => input.classList.remove('error-shake'), 500);
    }

    function resetInput(input) {
        input.style.borderColor = '';
        input.style.boxShadow = '';
    }

    // 5. Active Link Highlight
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-links a').forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPath) {
            link.classList.add('active');
        }
    });

    // 6. Intersection Observer for Scroll Animations
    const observerOptions = {
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    document.querySelectorAll('.pricing-card, .feature-item, .hero h1, .hero p').forEach(el => {
        observer.observe(el);
    });

});
