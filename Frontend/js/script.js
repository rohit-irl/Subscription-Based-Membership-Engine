/**
 * SparkEngine - Global JavaScript
 * Handles: Pricing Toggle, Form Validation, Navigation, Animations
 */

const API_BASE_URL =
    window.location.hostname === '127.0.0.1'
        ? 'http://127.0.0.1:5000'
        : 'http://localhost:5000';
const USER_ID_STORAGE_KEYS = ['sbme_user_id', 'sbme_current_user_id', 'userId'];
const AUTH_TOKEN_STORAGE_KEYS = ['authToken', 'token', 'jwt', 'accessToken'];

function getAuthToken() {
    for (const key of AUTH_TOKEN_STORAGE_KEYS) {
        const v = window.localStorage.getItem(key);
        if (v) return v;
    }
    return null;
}

function setAuthToken(token) {
    if (!token) {
        for (const key of AUTH_TOKEN_STORAGE_KEYS) window.localStorage.removeItem(key);
        return;
    }
    // Store into the canonical key we also use throughout the project
    window.localStorage.setItem('authToken', String(token));
}

function clearAuthState() {
    setStoredUserId(null);
    setAuthToken(null);
    for (const key of USER_ID_STORAGE_KEYS) window.localStorage.removeItem(key);
}

function isLoggedIn() {
    return Boolean(getAuthToken() || getStoredUserId());
}

function getCurrentPageName() {
    return window.location.pathname.split('/').pop() || 'index.html';
}

function getStoredUserId() {
    for (const key of USER_ID_STORAGE_KEYS) {
        const v = window.localStorage.getItem(key);
        if (v) return v;
    }
    return null;
}

function setStoredUserId(userId) {
    if (!userId) {
        for (const key of USER_ID_STORAGE_KEYS) window.localStorage.removeItem(key);
        return;
    }
    // Store into the canonical key we also use throughout the project
    window.localStorage.setItem('sbme_user_id', String(userId));
}

async function apiRequest(path, { method = 'GET', body } = {}) {
    const token = getAuthToken();
    const controller = new AbortController();
    const timeoutMs = 12000;
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    const options = {
        method,
        mode: 'cors',
        credentials: 'include',
        signal: controller.signal,
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
        }
    };

    if (token) {
        options.headers.Authorization = `Bearer ${token}`;
    }

    if (body !== undefined) {
        options.body = JSON.stringify(body);
    }

    let response;
    try {
        response = await fetch(`${API_BASE_URL}${path}`, options);
    } catch (error) {
        console.error('Network error:', error);
        const isTimeout = error && error.name === 'AbortError';
        const isOn127 = window.location && window.location.hostname === '127.0.0.1';
        const hint = isOn127
            ? 'If this is a CORS issue, try opening the frontend via http://localhost:5500 (not 127.0.0.1) so the Origin matches what your backend allows.'
            : 'If this is a CORS issue, ensure the backend allows your frontend Origin and headers.';

        const msg = isTimeout
            ? `Request timed out after ${Math.round(timeoutMs / 1000)}s. Is the backend running at ${API_BASE_URL}?`
            : `Cannot reach backend at ${API_BASE_URL}. ${hint}`;

        throw new Error(msg);
    } finally {
        window.clearTimeout(timeoutId);
    }

    const contentType = response.headers.get('content-type') || '';
    let data = null;

    try {
        data = contentType.includes('application/json')
            ? await response.json()
            : await response.text();
    } catch (error) {
        console.error('Failed to parse response:', error);
        data = null;
    }

    if (!response.ok) {
        const message = data && data.message ? data.message : `Request failed (${response.status})`;
        const err = new Error(message);
        err.status = response.status;
        err.data = data;
        throw err;
    }

    return data;
}

function updateNavbarAuthLinks() {
    const nav = document.querySelector('.nav-links');
    if (!nav) return;

    // Remove previously injected links
    nav.querySelectorAll('[data-auth-link="1"]').forEach(el => el.remove());

    const loggedIn = isLoggedIn();
    const loginLink = nav.querySelector('a[href="login.html"]');
    const signupLink = nav.querySelector('a[href="signup.html"]');

    if (loginLink) loginLink.style.display = loggedIn ? 'none' : '';
    if (signupLink) signupLink.style.display = loggedIn ? 'none' : '';

    if (loggedIn) {
        const profile = document.createElement('a');
        profile.href = 'profile.html';
        profile.textContent = 'Profile';
        profile.className = 'btn btn-outline btn-sm';
        profile.setAttribute('data-auth-link', '1');

        const logout = document.createElement('a');
        logout.href = '#';
        logout.textContent = 'Logout';
        logout.className = 'btn btn-outline btn-sm';
        logout.id = 'logoutBtnDynamic';
        logout.setAttribute('data-auth-link', '1');

        nav.appendChild(profile);
        nav.appendChild(logout);

        logout.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!confirm('Are you sure you want to logout?')) return;

            try {
                await apiRequest('/api/logout', { method: 'POST' });
            } catch (error) {
                // Ignore server logout errors; always clear client state
                console.warn('Logout failed:', error);
            } finally {
                clearAuthState();
                updateNavbarAuthLinks();
                window.location.href = 'login.html';
            }
        });
    }
}

function setAuthMessage(type, message) {
    const header = document.querySelector('.auth-header');
    if (!header) return;

    let el = header.querySelector('.auth-message');
    if (!el) {
        el = document.createElement('p');
        el.className = 'auth-message';
        el.style.marginTop = '8px';
        header.appendChild(el);
    }

    el.textContent = message || '';
    el.style.color =
        type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '';
}

function setDashboardMessage(type, message) {
    const container = document.querySelector('.dashboard .section-header');
    if (!container) return;

    let el = container.querySelector('.dashboard-message');
    if (!el) {
        el = document.createElement('p');
        el.className = 'dashboard-message';
        el.style.marginTop = '8px';
        el.style.fontSize = '0.9rem';
        container.appendChild(el);
    }

    el.textContent = message || '';
    el.style.color =
        type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '';
}

function getAuthFields(form) {
    const nameInput = form.querySelector('input[type="text"]');
    const emailInput = form.querySelector('input[type="email"]');
    const passwordInput = form.querySelector('input[type="password"]');
    const planSelect = form.querySelector('select');

    return { nameInput, emailInput, passwordInput, planSelect };
}

function isSignupForm(form) {
    const { nameInput, planSelect } = getAuthFields(form);
    return Boolean(nameInput && planSelect);
}

function normalizePlanLabel(value) {
    const map = { basic: 'Basic', pro: 'Pro', enterprise: 'Enterprise' };
    return map[value] || (value ? String(value) : 'Free');
}

async function handleAuthSubmit(form) {
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';

    const { nameInput, emailInput, passwordInput, planSelect } = getAuthFields(form);
    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value.trim() : '';

    if (!email || !password) {
        setAuthMessage('error', 'Please fill in all required fields.');
        return;
    }

    const signup = isSignupForm(form);
    const name = signup
        ? (nameInput ? nameInput.value.trim() : 'User')
        : (email.split('@')[0] || 'User');
    const plan = signup ? normalizePlanLabel(planSelect ? planSelect.value : '') : 'Free';

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        }

        setAuthMessage('success', signup ? 'Creating your account...' : 'Signing you in...');

        // Backend exposes /register only; treat it as "register if new, else login if exists"
        const data = await apiRequest('/register', {
            method: 'POST',
            body: { name, email, password, plan }
        });

        if (data && data.id) {
            setStoredUserId(data.id);
        }
        if (data && data.token) {
            setAuthToken(data.token);
        }

        updateNavbarAuthLinks();
        setAuthMessage('success', (data && data.message) || 'Success. Redirecting...');
        const target = form.dataset.redirect || 'dashboard.html';
        window.setTimeout(() => {
            window.location.href = target;
        }, 700);
    } catch (error) {
        console.error('Auth failed:', error);
        setAuthMessage('error', error.message || 'Request failed. Please try again.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHtml;
        }
    }
}

function getDashboardPlanCard() {
    const badge = document.querySelector('.popular-badge');
    if (!badge) return null;
    return badge.closest('.dash-card');
}

function formatDownloads(user) {
    const downloadsUsed = user?.downloads_used ?? user?.downloadsUsed ?? 0;
    const downloadLimit = user?.download_limit ?? user?.downloadLimit ?? null;
    const remainingDownloads = user?.remainingDownloads;

    return {
        downloadsUsed,
        downloadLimit,
        remainingDownloads:
            typeof remainingDownloads === 'number' && remainingDownloads >= 0
                ? remainingDownloads
                : (typeof downloadLimit === 'number'
                    ? Math.max(downloadLimit - downloadsUsed, 0)
                    : null)
    };
}

async function loadDashboardUser() {
    const page = getCurrentPageName();
    if (page !== 'dashboard.html') return;

    const userId = getStoredUserId();
    if (!userId) {
        // No session; go to login
        window.location.href = 'login.html';
        return;
    }

    setDashboardMessage('success', 'Loading your account...');

    let user;
    try {
        user = await apiRequest(`/user/${encodeURIComponent(userId)}`);
    } catch (error) {
        console.error('Failed to load user:', error);
        setDashboardMessage('error', error.message || 'Unable to load your account.');
        if (error && error.status === 404) {
            setStoredUserId(null);
            window.setTimeout(() => {
                window.location.href = 'login.html';
            }, 700);
        }
        return;
    }

    // Header name
    const headerTitle = document.querySelector('.dashboard .section-header h2');
    if (headerTitle && user && user.name) {
        headerTitle.textContent = `Welcome back, ${user.name}!`;
    }

    // Plan card updates
    const planCard = getDashboardPlanCard();
    if (planCard) {
        const planH3 = planCard.querySelector('h3');
        const planName = user?.plan_name ?? user?.plan ?? 'Free';
        if (planH3) planH3.textContent = planName;

        // Add a small usage line (DOM-only, no HTML/CSS edits)
        let meta = planCard.querySelector('.download-meta');
        if (!meta) {
            meta = document.createElement('p');
            meta.className = 'download-meta';
            meta.style.marginTop = '8px';
            meta.style.fontSize = '0.9rem';
            meta.style.color = 'var(--text-muted)';
            planCard.appendChild(meta);
        }

        const { downloadsUsed, downloadLimit, remainingDownloads: remaining } = formatDownloads(user);
        if (typeof downloadLimit === 'number') {
            meta.textContent = `Downloads: ${remaining} / ${downloadLimit}`;
        } else {
            meta.textContent = `Downloads used: ${downloadsUsed}`;
        }

        // Bind upgrade click to backend (dashboard currently links to pricing.html)
        const upgradeLink = planCard.querySelector('a.btn.btn-primary');
        if (upgradeLink && !upgradeLink.dataset.boundUpgrade) {
            upgradeLink.addEventListener('click', async (e) => {
                e.preventDefault();
                const uid = getStoredUserId();
                if (!uid) {
                    setDashboardMessage('error', 'Please log in again.');
                    window.location.href = 'login.html';
                    return;
                }

                const originalText = upgradeLink.textContent;
                upgradeLink.classList.add('disabled');
                upgradeLink.textContent = 'Upgrading...';

                try {
                    const upgraded = await apiRequest('/upgrade', {
                        method: 'POST',
                        body: { userId: uid }
                    });
                    setDashboardMessage('success', upgraded.message || 'Plan upgraded.');
                    // Reload to refresh UI data
                    await loadDashboardUser();
                } catch (error) {
                    console.error('Upgrade failed:', error);
                    setDashboardMessage('error', error.message || 'Upgrade failed.');
                } finally {
                    upgradeLink.classList.remove('disabled');
                    upgradeLink.textContent = originalText;
                }
            });
            upgradeLink.dataset.boundUpgrade = 'true';
        }

        // Inject and bind download button (if not present in layout)
        let downloadBtn = planCard.querySelector('#downloadBtn');
        if (!downloadBtn) {
            downloadBtn = document.createElement('button');
            downloadBtn.id = 'downloadBtn';
            downloadBtn.className = 'btn btn-outline btn-full';
            downloadBtn.textContent = 'Download Resource';
            downloadBtn.style.marginTop = '12px';
            planCard.appendChild(downloadBtn);
        }

        const { remainingDownloads: remainingAfterLoad } = formatDownloads(user);
        if (typeof remainingAfterLoad === 'number' && remainingAfterLoad <= 0) {
            downloadBtn.disabled = true;
        }

        if (!downloadBtn.dataset.boundDownload) {
            downloadBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                
                // Use jsPDF to generate a document
                if (typeof window.jspdf === 'undefined') {
                    setDashboardMessage('error', 'PDF library not loaded.');
                    return;
                }
                
                const btnText = downloadBtn.textContent;
                downloadBtn.disabled = true;
                downloadBtn.textContent = 'Preparing...';
                
                try {
                    const { jsPDF } = window.jspdf;
                    const doc = new jsPDF();
                    
                    doc.setFontSize(22);
                    doc.setTextColor(16, 185, 129); // Primary color
                    doc.text('CapySphere Resource Download', 20, 30);
                    
                    doc.setFontSize(18);
                    doc.setTextColor(15, 23, 42); // Text main
                    doc.text('Premium Resources Pack', 20, 45);
                    
                    doc.setFontSize(12);
                    doc.setTextColor(100, 116, 139); // Text muted
                    doc.text('Thank you for being a CapySphere member! Here are your assets.', 20, 55);
                    
                    doc.setFontSize(14);
                    doc.setTextColor(15, 23, 42); 
                    doc.text('Your Unlock Keys & URLs:', 20, 75);
                    
                    doc.setFontSize(11);
                    doc.setTextColor(59, 130, 246);
                    doc.text('• High-Res UI Kit (Figma): https://capysphere.com/dl/ui-kit-v2', 25, 85);
                    doc.text('• Exclusive API Beta Access: https://api.capysphere.com/v2/beta', 25, 95);
                    doc.text('• Analytics Dashboard Templates (.zip)', 25, 105);
                    
                    doc.setTextColor(15, 23, 42);
                    doc.text('Your Access Token:', 20, 125);
                    doc.setFont(undefined, 'bold');
                    doc.text('CPY-8472-X9KL-P21M', 20, 132);
                    doc.setFont(undefined, 'normal');
                    
                    doc.setTextColor(100, 116, 139);
                    doc.text(`License holder: ${user?.name || 'User'} (${user?.email || 'N/A'})`, 20, 150);
                    doc.text(`Plan type: ${user?.plan_name || user?.plan || 'Free'}`, 20, 158);
                    
                    const { remainingDownloads } = formatDownloads(user);
                    if (remainingDownloads !== null) {
                        doc.text(`Downloads remaining this month: ${Math.max(0, remainingDownloads - 1)}`, 20, 166);
                    }
                    
                    doc.setFontSize(10);
                    doc.text(`Document generated on: ${new Date().toLocaleString()}`, 20, 280);
                    
                    doc.save('capysphere_resource.pdf');
                    
                    setDashboardMessage('success', 'Resource downloaded successfully!');
                    
                } catch (error) {
                    console.error('PDF generation failed:', error);
                    setDashboardMessage('error', 'Failed to generate PDF.');
                } finally {
                    downloadBtn.disabled = false;
                    downloadBtn.textContent = btnText;
                }
            });
            downloadBtn.dataset.boundDownload = 'true';
        }
        
        // Inject and bind manage invoices button
        const invoiceBtn = document.getElementById('manageInvoicesBtn');
        if (invoiceBtn && !invoiceBtn.dataset.boundInvoice) {
            invoiceBtn.addEventListener('click', (e) => {
                e.preventDefault();
                
                if (typeof window.jspdf === 'undefined') {
                    setDashboardMessage('error', 'PDF library not loaded.');
                    return;
                }
                
                const originalText = invoiceBtn.innerHTML;
                invoiceBtn.innerHTML = 'Generating...';
                
                try {
                    const { jsPDF } = window.jspdf;
                    const doc = new jsPDF();
                    
                    doc.setFontSize(24);
                    doc.setTextColor(59, 130, 246); // Secondary color
                    doc.text('INVOICE', 105, 30, { align: 'center' });
                    
                    doc.setFontSize(14);
                    doc.setTextColor(15, 23, 42); // Text main
                    doc.text('CapySphere Inc.', 20, 50);
                    doc.setFontSize(11);
                    doc.setTextColor(100, 116, 139); // Text muted
                    doc.text('123 Innovation Drive', 20, 58);
                    doc.text('Tech District, CA 90210', 20, 64);
                    
                    doc.setFontSize(12);
                    doc.setTextColor(15, 23, 42);
                    doc.text('Billed To:', 140, 50);
                    doc.setFontSize(11);
                    doc.setTextColor(100, 116, 139);
                    doc.text(`${user?.name || 'User'}`, 140, 58);
                    doc.text(`${user?.email || 'N/A'}`, 140, 64);
                    
                    doc.setLineWidth(0.5);
                    doc.line(20, 80, 190, 80);
                    
                    doc.setFontSize(12);
                    doc.setTextColor(15, 23, 42);
                    doc.text('Description', 20, 90);
                    doc.text('Amount', 170, 90);
                    
                    doc.line(20, 95, 190, 95);
                    
                    const planName = user?.plan_name || user?.plan || 'Pro Plan';
                    let amount = '$49.00';
                    if (planName.toLowerCase() === 'basic') amount = '$19.00';
                    if (planName.toLowerCase() === 'premium') amount = '$99.00';
                    
                    doc.setFontSize(11);
                    doc.setTextColor(100, 116, 139);
                    doc.text(`${planName} - Monthly Subscription`, 20, 105);
                    doc.text(amount, 170, 105);
                    
                    doc.line(20, 115, 190, 115);
                    
                    doc.setFontSize(12);
                    doc.setTextColor(15, 23, 42);
                    doc.text('Total:', 140, 125);
                    doc.text(amount, 170, 125);
                    
                    doc.save('capysphere_invoice.pdf');
                    
                    setDashboardMessage('success', 'Invoice downloaded successfully.');
                } catch (error) {
                    console.error('Invoice generation failed:', error);
                    setDashboardMessage('error', 'Failed to generate invoice.');
                } finally {
                    invoiceBtn.innerHTML = originalText;
                }
            });
            invoiceBtn.dataset.boundInvoice = 'true';
        }
    }
}

function bindLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (!logoutBtn) return;

    if (logoutBtn.dataset.boundLogout) return;
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm('Are you sure you want to logout?')) {
            clearAuthState();
            updateNavbarAuthLinks();
            window.location.href = 'login.html';
        }
    }, true);
    logoutBtn.dataset.boundLogout = 'true';
}

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

    // 1b. Pricing -> Payment redirect (only if logged in)
    const pricingGrid = document.querySelector('.pricing-grid');
    if (pricingGrid) {
        const isAnyTokenPresent = isLoggedIn();
        const cards = Array.from(pricingGrid.querySelectorAll('.pricing-card'));

        const getDisplayedPrice = (card) => {
            const amountEl = card.querySelector('.amount');
            if (!amountEl) return null;
            const raw = String(amountEl.textContent || '').replace(/[^0-9]/g, '');
            const parsed = parseInt(raw, 10);
            if (Number.isFinite(parsed) && parsed > 0) return parsed;

            // Fallback: use dataset based on billing toggle state
            if (billingToggle && billingToggle.checked && amountEl.dataset.yearly) {
                return parseInt(amountEl.dataset.yearly, 10);
            }
            if (amountEl && amountEl.dataset.monthly) return parseInt(amountEl.dataset.monthly, 10);
            return null;
        };

        cards.forEach((card) => {
            const btn = card.querySelector('a.btn');
            if (!btn) return;
            if (btn.dataset.pricingRedirectBound === '1') return;

            btn.dataset.pricingRedirectBound = '1';
            btn.addEventListener('click', (e) => {
                e.preventDefault();

                const token = getAuthToken();
                const userId = getStoredUserId();

                if (!token || !userId) {
                    window.location.href = 'login.html';
                    return;
                }

                const planName = card.querySelector('h3')?.textContent?.trim();
                const amount = getDisplayedPrice(card);

                if (!planName || !amount) {
                    // If something is missing, fallback to login to avoid a broken payment page.
                    window.location.href = 'login.html';
                    return;
                }

                window.location.href = `payment.html?action=upgrade&plan=${encodeURIComponent(
                    planName
                )}&amount=${encodeURIComponent(amount)}`;
            });
        });
    }

    // 2. Form Submission (Login/Signup Pages) -> Backend Integration
    const authForm = document.getElementById('authForm');
    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            let isValid = true;
            const inputs = authForm.querySelectorAll('input[required], select[required]');

            inputs.forEach(input => {
                if (!input.value.trim()) {
                    isValid = false;
                    highlightInput(input);
                } else {
                    resetInput(input);
                }
            });

            if (!isValid) {
                setAuthMessage('error', 'Please fill in all required fields.');
                return;
            }

            await handleAuthSubmit(authForm);
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

    // 5. Active Link Highlight (Moved into a function to call after header load)
    function highlightActiveLink() {
        const currentPath = getCurrentPageName();
        document.querySelectorAll('.nav-links a').forEach(link => {
            const href = link.getAttribute('href');
            if (href === currentPath) {
                link.classList.add('active');
            }
        });
    }

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

    // 7. Dashboard session + actions
    // This is now delayed until the header loads if global-header is present
    function initSessionActions() {
        updateNavbarAuthLinks();
        bindLogout();
        loadDashboardUser();
    }

    // 8. Scroll reveal (lightweight, Framer-ish)
    const revealEls = Array.from(document.querySelectorAll('.reveal'));
    if (!('IntersectionObserver' in window)) {
        revealEls.forEach(el => el.classList.add('is-visible'));
    } else {
        const revealIo = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('is-visible');
                        revealIo.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.12 }
        );
        revealEls.forEach(el => revealIo.observe(el));
    }

    // 9. Load Global Footer
    const footerContainer = document.getElementById('global-footer');
    if (footerContainer) {
        fetch('footer.html')
            .then(res => {
                if (!res.ok) throw new Error('Footer not found');
                return res.text();
            })
            .then(html => {
                // Replace the placeholder div with the actual footer HTML
                footerContainer.outerHTML = html;
            })
            .catch(err => console.error('Error loading footer:', err));
    }

    // 10. Load Global Header
    const headerContainer = document.getElementById('global-header');
    if (headerContainer) {
        fetch('header.html')
            .then(res => {
                if (!res.ok) throw new Error('Header not found');
                return res.text();
            })
            .then(html => {
                headerContainer.outerHTML = html;
                highlightActiveLink();
                initSessionActions();
            })
            .catch(err => {
                console.error('Error loading header:', err);
                initSessionActions(); // Fallback in case of failure
            });
    } else {
        // If no global header placeholder is found, run actions anyway
        highlightActiveLink();
        initSessionActions();
    }

});
