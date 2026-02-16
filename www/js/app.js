/* ===== app.js — Main Application Controller ===== */

const App = (() => {
  let searchTimeout = null;
  let selectedDestination = null;
  let currentScreen = 'splashScreen';
  let screenHistory = [];
  let editingContactId = null;
  let feedbackRating = 0;
  let sharingWith = null;

  /* ===== CONTACTS STORE (localStorage) ===== */
  const CONTACTS_KEY = 'leadinglight_contacts';
  const PROFILE_KEY = 'leadinglight_profile';

  function getContacts() {
    try {
      const raw = JSON.parse(localStorage.getItem(CONTACTS_KEY));
      if (!raw) return getDefaultContacts();
      /* Migrate contacts that lack the email field */
      return raw.map(c => ({ email: '', ...c }));
    } catch { return getDefaultContacts(); }
  }

  function saveContacts(contacts) {
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
  }

  function getDefaultContacts() {
    const defaults = [
      { id: 1, name: 'Mom', phone: '(555) 123-4567', email: '', relationship: 'Mother' },
      { id: 2, name: 'Jake', phone: '(555) 987-6543', email: '', relationship: 'Roommate' }
    ];
    saveContacts(defaults);
    return defaults;
  }

  function getProfile() {
    try {
      return JSON.parse(localStorage.getItem(PROFILE_KEY)) || getDefaultProfile();
    } catch { return getDefaultProfile(); }
  }

  function saveProfile(profile) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }

  function getDefaultProfile() {
    const defaults = { name: 'Jane Doe', email: 'jane@example.com', phone: '+1 (555) 000-0000' };
    saveProfile(defaults);
    return defaults;
  }

  function getInitials(name) {
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  /* ===== INIT ===== */
  function init() {
    setupSplashFlow();
    setupAuthScreens();
    setupBottomNav();
    setupLocateBtn();
    setupTopbarAvatar();
    setupSearch();
    setupBottomSheet();
    setupSettings();
    setupProfile();
    setupContacts();
    setupFeedback();
    setupShareLocation();
    setupShareBanner();

    /* Populate profile data everywhere */
    refreshProfileUI();

    console.log('[LeadingLight] App initialized');
  }

  /* ===== SCREEN NAVIGATION ===== */
  function showScreen(id, addToHistory = true) {
    if (addToHistory && currentScreen && currentScreen !== id) {
      screenHistory.push(currentScreen);
    }

    /* Hide all screens */
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');

    /* Show target */
    const target = document.getElementById(id);
    if (target) {
      target.style.display = '';
      currentScreen = id;
    }

    /* If showing mainApp, initialize map (once) + reset nav */
    if (id === 'mainApp') {
      document.querySelectorAll('.bottom-nav__item').forEach(i => i.classList.remove('bottom-nav__item--active'));
      document.querySelector('[data-tab="map"]')?.classList.add('bottom-nav__item--active');

      if (typeof MapModule !== 'undefined' && !MapModule.getMap()) {
        MapModule.init();
        RoutesModule.init();
        EmergencyModule.init();
        ReportsModule.init();
      }
    }
  }

  function goBack() {
    const prev = screenHistory.pop();
    if (prev) {
      showScreen(prev, false);
    } else {
      showScreen('mainApp', false);
    }
  }

  /* ===== SPLASH FLOW ===== */
  function setupSplashFlow() {
    /* Show splash first */
    showScreen('splashScreen', false);

    /* After 2s → straight to map */
    setTimeout(() => {
      enterApp();
    }, 2000);

    /* Keep event listeners in case user navigates back to auth screens */
    document.getElementById('welcomeGetStarted')?.addEventListener('click', () => {
      showScreen('signupScreen');
    });
    document.getElementById('welcomeToLogin')?.addEventListener('click', (e) => {
      e.preventDefault();
      showScreen('loginScreen');
    });
    document.getElementById('welcomeSkip')?.addEventListener('click', (e) => {
      e.preventDefault();
      enterApp();
    });
  }

  /* ===== AUTH SCREENS ===== */
  function setupAuthScreens() {
    /* Login back button */
    document.getElementById('loginBack')?.addEventListener('click', () => goBack());

    /* Signup back button */
    document.getElementById('signupBack')?.addEventListener('click', () => goBack());

    /* Login → forgot (no-op) */

    /* Login → Sign Up link */
    document.getElementById('loginToSignup')?.addEventListener('click', (e) => {
      e.preventDefault();
      showScreen('signupScreen');
    });

    /* Signup → Log In link */
    document.getElementById('signupToLogin')?.addEventListener('click', (e) => {
      e.preventDefault();
      showScreen('loginScreen');
    });

    /* Skip buttons on auth screens */
    document.getElementById('loginSkip')?.addEventListener('click', (e) => {
      e.preventDefault();
      enterApp();
    });
    document.getElementById('signupSkip')?.addEventListener('click', (e) => {
      e.preventDefault();
      enterApp();
    });

    /* Login form submit → main app */
    document.getElementById('loginForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      enterApp();
    });

    /* Signup form submit → main app */
    document.getElementById('signupForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      /* Save name/email from signup */
      const inputs = e.target.querySelectorAll('.form-field__input');
      if (inputs.length >= 2) {
        const profile = getProfile();
        profile.name = inputs[0].value || profile.name;
        profile.email = inputs[1].value || profile.email;
        saveProfile(profile);
        refreshProfileUI();
      }
      enterApp();
    });
  }

  function enterApp() {
    screenHistory = [];
    showScreen('mainApp', false);

    /* Initialize map modules if not already done */
    if (typeof MapModule !== 'undefined') {
      try {
        if (!MapModule.getMap()) {
          MapModule.init();
          RoutesModule.init();
          EmergencyModule.init();
          ReportsModule.init();
        }
      } catch {
        MapModule.init();
        RoutesModule.init();
        EmergencyModule.init();
        ReportsModule.init();
      }
    }

    showToast('Welcome to Leading Light!');
  }

  /* ===== BOTTOM NAV (Google Maps style) ===== */
  function setupBottomNav() {
    document.querySelectorAll('.bottom-nav__item[data-tab]').forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.dataset.tab;

        /* SOS is handled by EmergencyModule (same #sosBtn id) */
        if (tab === 'sos') return;

        /* Update active tab highlight */
        document.querySelectorAll('.bottom-nav__item').forEach(i => i.classList.remove('bottom-nav__item--active'));
        if (tab !== 'share') item.classList.add('bottom-nav__item--active');
        else document.querySelector('[data-tab="map"]')?.classList.add('bottom-nav__item--active');

        switch (tab) {
          case 'map':
            break;
          case 'share':
            openShareModal();
            break;
          case 'contacts':
            showScreen('contactsScreen');
            renderContactsList();
            break;
          case 'settings':
            showScreen('settingsScreen');
            break;
        }
      });
    });

    /* Escape key */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (typeof EmergencyModule !== 'undefined') EmergencyModule.closeSOS();
        if (typeof ReportsModule !== 'undefined') ReportsModule.closeModal();
        if (typeof RoutesModule !== 'undefined' && RoutesModule.closeNavView) RoutesModule.closeNavView();
        closeShareModal();
      }
    });
  }

  /* ===== LOCATE / HOME BUTTON ===== */
  function setupLocateBtn() {
    document.getElementById('locateBtn')?.addEventListener('click', () => {
      if (typeof MapModule !== 'undefined') {
        MapModule.goHome();
        showToast('Centering on your location\u2026');
      }
    });
  }

  /* ===== TOPBAR AVATAR ===== */
  function setupTopbarAvatar() {
    document.getElementById('topbarAvatar')?.addEventListener('click', () => {
      showScreen('settingsScreen');
    });
  }

  /* ===== SEARCH — Nominatim Geocoding ===== */
  function setupSearch() {
    const input = document.getElementById('searchInput');
    const suggestions = document.getElementById('searchSuggestions');
    const clearBtn = document.getElementById('searchClear');

    if (!input || !suggestions) return;

    /* Clear button */
    clearBtn?.addEventListener('click', () => {
      input.value = '';
      suggestions.classList.remove('active');
      suggestions.innerHTML = '';
      selectedDestination = null;
      MapModule.clearDestination();
      /* Close both nav view and route panel */
      if (RoutesModule.closeNavView) RoutesModule.closeNavView();
      RoutesModule.closePanel();
      input.focus();
    });

    input.addEventListener('input', () => {
      const q = input.value.trim();
      if (searchTimeout) clearTimeout(searchTimeout);

      if (q.length < 3) {
        suggestions.classList.remove('active');
        suggestions.innerHTML = '';
        return;
      }

      suggestions.innerHTML = '<div class="suggestion suggestion--loading"><span class="suggestion__text"><span class="suggestion__name">Searching…</span></span></div>';
      suggestions.classList.add('active');

      searchTimeout = setTimeout(() => geocodeSearch(q, suggestions, input), 350);
    });

    /* Click suggestion → set destination & show bottom sheet */
    suggestions.addEventListener('click', (e) => {
      const item = e.target.closest('.suggestion');
      if (!item || item.classList.contains('suggestion--loading')) return;

      const lat = parseFloat(item.dataset.lat);
      const lng = parseFloat(item.dataset.lng);
      const name = item.querySelector('.suggestion__name').textContent;

      input.value = name;
      suggestions.classList.remove('active');

      selectedDestination = { lat, lng, name };
      MapModule.setDestination([lat, lng], name);

      /* Open bottom sheet for the selected destination */
      const origin = MapModule.getUserPosition();
      const mp = MapModule.getMap();
      const dist = mp.distance([origin.lat, origin.lng], [lat, lng]);
      let distStr;
      if (dist < 1000) distStr = `${Math.round(dist)}m away`;
      else distStr = `${(dist / 1609.34).toFixed(1)} mi away`;

      MapModule.showBottomSheet({
        title: name,
        desc: '',
        time: 'Selected',
        distance: distStr,
        lat, lng
      });
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.topbar') && !e.target.closest('.search-suggestions')) {
        suggestions.classList.remove('active');
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const q = input.value.trim();
        if (q.length >= 3) {
          if (searchTimeout) clearTimeout(searchTimeout);
          geocodeSearch(q, suggestions, input);
        }
      }
    });
  }

  async function geocodeSearch(query, suggestionsEl, inputEl) {
    try {
      const map = MapModule.getMap();
      const bounds = map.getBounds();
      const viewbox = `${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()},${bounds.getSouth()}`;

      const url = `https://nominatim.openstreetmap.org/search?` +
        `format=json&q=${encodeURIComponent(query)}` +
        `&viewbox=${viewbox}&bounded=0` +
        `&limit=6&addressdetails=1`;

      const resp = await fetch(url, { headers: { 'Accept-Language': 'en' } });
      if (!resp.ok) throw new Error('Geocoding failed');

      const results = await resp.json();

      if (inputEl.value.trim().length < 3) {
        suggestionsEl.classList.remove('active');
        return;
      }

      if (results.length === 0) {
        suggestionsEl.innerHTML = '<div class="suggestion suggestion--loading"><span class="suggestion__text"><span class="suggestion__name" style="color:var(--text-m)">No results found</span></span></div>';
        suggestionsEl.classList.add('active');
        return;
      }

      suggestionsEl.innerHTML = results.map(r => {
        const icon = getPlaceIcon(r.type, r.class);
        const name = r.display_name.split(',')[0];
        const address = r.display_name.split(',').slice(1, 3).join(',').trim();
        return `
          <div class="suggestion" data-lat="${r.lat}" data-lng="${r.lon}">
            <div class="suggestion__icon">${icon}</div>
            <div class="suggestion__text">
              <span class="suggestion__name">${escapeHtml(name)}</span>
              <span class="suggestion__address">${escapeHtml(address)}</span>
            </div>
          </div>
        `;
      }).join('');

      suggestionsEl.classList.add('active');
    } catch (err) {
      console.error('[Search] Geocoding error:', err);
      suggestionsEl.innerHTML = '<div class="suggestion suggestion--loading"><span class="suggestion__text"><span class="suggestion__name" style="color:var(--red)">Search error — try again</span></span></div>';
    }
  }

  function getPlaceIcon(type, cls) {
    const icons = {
      university: '🎓', school: '🏫', college: '🎓',
      library: '📚', museum: '🏛️', theatre: '🎭',
      restaurant: '🍽️', cafe: '☕', bar: '🍺', fast_food: '🍔',
      hospital: '🏥', pharmacy: '💊', doctors: '⚕️',
      park: '🌳', garden: '🌿', stadium: '🏟️', sports_centre: '⚽',
      bus_stop: '🚌', station: '🚉', parking: '🅿️',
      supermarket: '🛒', shop: '🛍️', mall: '🏬',
      hotel: '🏨', apartment: '🏢', house: '🏠',
      church: '⛪', place_of_worship: '🕌',
      residential: '📍', suburb: '📍', city: '🏙️', town: '🏘️',
    };
    return icons[type] || icons[cls] || '📍';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ===== BOTTOM SHEET ===== */
  function setupBottomSheet() {
    const routeBtn = document.getElementById('sheetRouteBtn');
    const sheet = document.getElementById('bottomSheet');
    const handle = document.getElementById('sheetHandle');

    /* "Get the Route" uses coords stored in sheet dataset or selectedDestination */
    routeBtn?.addEventListener('click', () => {
      const lat = parseFloat(sheet?.dataset.lat);
      const lng = parseFloat(sheet?.dataset.lng);
      console.log('[App] Get Route clicked, dest coords:', lat, lng);
      if (isNaN(lat) || isNaN(lng)) {
        console.error('[App] Invalid destination coordinates');
        return;
      }

      selectedDestination = { lat, lng, name: document.getElementById('sheetTitle')?.textContent || '' };
      MapModule.hideBottomSheet();

      const origin = MapModule.getUserPosition();
      console.log('[App] Origin:', origin, 'Destination:', { lat, lng });
      RoutesModule.fetchRoutes(
        { lat: origin.lat, lng: origin.lng },
        { lat, lng }
      );
    });

    /* Tap handle to dismiss */
    handle?.addEventListener('click', () => {
      MapModule.hideBottomSheet();
    });

    /* Swipe-down to dismiss bottom sheet */
    let startY = 0;
    let currentY = 0;
    let dragging = false;

    sheet?.addEventListener('touchstart', (e) => {
      startY = e.touches[0].clientY;
      currentY = startY;
      dragging = true;
    }, { passive: true });

    sheet?.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      currentY = e.touches[0].clientY;
      const dy = currentY - startY;
      if (dy > 0) {
        sheet.style.transform = `translateY(${dy}px)`;
      }
    }, { passive: true });

    sheet?.addEventListener('touchend', () => {
      if (!dragging) return;
      dragging = false;
      const dy = currentY - startY;
      if (dy > 60) {
        /* Animate out then hide */
        sheet.style.transition = 'transform .2s ease-out';
        sheet.style.transform = `translateY(${sheet.offsetHeight + 40}px)`;
        setTimeout(() => {
          sheet.style.transition = '';
          sheet.style.transform = '';
          MapModule.hideBottomSheet();
        }, 220);
      } else {
        /* Snap back */
        sheet.style.transition = 'transform .15s ease';
        sheet.style.transform = '';
        setTimeout(() => { sheet.style.transition = ''; }, 160);
      }
    });

    /* Tap on map to dismiss bottom sheet */
    const mapEl = document.getElementById('map');
    mapEl?.addEventListener('click', (e) => {
      /* Don't dismiss if tapping a marker (Leaflet adds .leaflet-marker-icon) */
      if (e.target.closest('.leaflet-marker-icon') || e.target.closest('.leaflet-popup')) return;
      if (!sheet?.classList.contains('hidden')) {
        MapModule.hideBottomSheet();
      }
    });

    /* --- Route panel: swipe-down to dismiss --- */
    const routePanel = document.getElementById('routePanel');
    let rpStartY = 0, rpCurrentY = 0, rpDragging = false, rpMoved = false;

    routePanel?.addEventListener('touchstart', (e) => {
      /* Don't hijack touches on buttons/links */
      if (e.target.closest('button, a, .route-card')) { rpDragging = false; return; }
      rpStartY = e.touches[0].clientY;
      rpCurrentY = rpStartY;
      rpDragging = true;
      rpMoved = false;
    }, { passive: true });

    routePanel?.addEventListener('touchmove', (e) => {
      if (!rpDragging) return;
      rpCurrentY = e.touches[0].clientY;
      const dy = rpCurrentY - rpStartY;
      if (dy > 8) {
        rpMoved = true;
        routePanel.style.transform = `translateY(${dy}px)`;
      }
    }, { passive: true });

    routePanel?.addEventListener('touchend', () => {
      if (!rpDragging || !rpMoved) { rpDragging = false; return; }
      rpDragging = false;
      rpMoved = false;
      const dy = rpCurrentY - rpStartY;

      if (dy > 60) {
        /* Animate out then close */
        routePanel.style.transition = 'transform .2s ease-out';
        routePanel.style.transform = `translateY(${routePanel.offsetHeight + 40}px)`;
        setTimeout(() => {
          routePanel.style.transition = '';
          routePanel.style.transform = '';
          RoutesModule.closePanel();
        }, 220);
      } else {
        /* Snap back */
        routePanel.style.transition = 'transform .15s ease';
        routePanel.style.transform = '';
        setTimeout(() => { routePanel.style.transition = ''; }, 160);
      }
    });
  }

  /* ===== SETTINGS ===== */
  function setupSettings() {
    /* Back */
    document.getElementById('settingsBack')?.addEventListener('click', () => goBack());
    document.getElementById('profileBack')?.addEventListener('click', () => goBack());
    document.getElementById('notifBack')?.addEventListener('click', () => goBack());
    document.getElementById('passwordBack')?.addEventListener('click', () => goBack());
    document.getElementById('contactsBack')?.addEventListener('click', () => goBack());
    document.getElementById('contactFormBack')?.addEventListener('click', () => goBack());
    document.getElementById('feedbackBack')?.addEventListener('click', () => goBack());

    /* Settings items */
    document.querySelectorAll('.settings-item[data-goto]').forEach(item => {
      item.addEventListener('click', () => {
        const target = item.dataset.goto;
        if (target === 'contacts') {
          showScreen('contactsScreen');
          renderContactsList();
        } else {
          showScreen(target);
        }

        if (target === 'feedbackScreen') resetFeedback();

        /* Load profile data when opening profile */
        if (target === 'profileSettings') {
          const profile = getProfile();
          const pn = document.getElementById('profileName');
          const pe = document.getElementById('profileEmail');
          const pp = document.getElementById('profilePhone');
          if (pn) pn.value = profile.name;
          if (pe) pe.value = profile.email;
          if (pp) pp.value = profile.phone;
        }
      });
    });

    /* Password form */
    document.getElementById('passwordForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      showToast('Password updated successfully');
      e.target.reset();
      setTimeout(() => goBack(), 800);
    });

    /* Logout from settings */
    document.getElementById('settingsLogoutBtn')?.addEventListener('click', () => {
      screenHistory = [];
      showScreen('welcomeScreen', false);
    });
  }

  /* ===== PROFILE ===== */
  function setupProfile() {
    document.getElementById('profileForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const profile = {
        name: document.getElementById('profileName')?.value || '',
        email: document.getElementById('profileEmail')?.value || '',
        phone: document.getElementById('profilePhone')?.value || ''
      };
      saveProfile(profile);
      refreshProfileUI();
      showToast('Profile saved');
    });
  }

  function refreshProfileUI() {
    const profile = getProfile();
    const initials = getInitials(profile.name);

    /* Topbar avatar */
    const ta = document.getElementById('topbarAvatarText');
    if (ta) ta.textContent = initials;

    /* Profile settings */
    const pa = document.getElementById('profileAvatarDisplay');
    if (pa) pa.textContent = initials;
  }

  /* ===== CONTACTS CRUD ===== */
  function setupContacts() {
    /* Add Contact button */
    document.getElementById('addContactBtn')?.addEventListener('click', () => {
      editingContactId = null;
      const title = document.getElementById('contactFormTitle');
      if (title) title.textContent = 'Add Contact';
      document.getElementById('contactForm')?.reset();
      showScreen('contactFormScreen');
    });

    /* Contact form submit */
    document.getElementById('contactForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('contactNameInput')?.value.trim();
      const phone = document.getElementById('contactPhoneInput')?.value.trim();
      const email = document.getElementById('contactEmailInput')?.value.trim();
      const rel = document.getElementById('contactRelInput')?.value.trim();

      if (!name || !phone) return;

      const contacts = getContacts();

      if (editingContactId !== null) {
        /* Edit existing */
        const idx = contacts.findIndex(c => c.id === editingContactId);
        if (idx !== -1) {
          contacts[idx] = { ...contacts[idx], name, phone, email, relationship: rel };
        }
        showToast('Contact updated');
      } else {
        /* Add new */
        const maxId = contacts.reduce((max, c) => Math.max(max, c.id), 0);
        contacts.push({ id: maxId + 1, name, phone, email, relationship: rel });
        showToast('Contact added');
      }

      saveContacts(contacts);
      editingContactId = null;
      goBack();
      /* Small delay to let screen transition, then re-render */
      setTimeout(() => renderContactsList(), 100);
    });
  }

  function renderContactsList() {
    const container = document.getElementById('contactsList');
    if (!container) return;

    const contacts = getContacts();

    if (contacts.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--text-m);padding:32px 0">No emergency contacts yet.</p>';
      return;
    }

    container.innerHTML = contacts.map(c => `
      <div class="contact-card" data-id="${c.id}">
        <div class="contact-card__avatar">${getInitials(c.name)}</div>
        <div class="contact-card__info">
          <span class="contact-card__name">${escapeHtml(c.name)}</span>
          <span class="contact-card__phone">${escapeHtml(c.phone)}</span>
          ${c.email ? `<span class="contact-card__phone" style="font-size:11px">${escapeHtml(c.email)}</span>` : ''}
          ${c.relationship ? `<span class="contact-card__rel">${escapeHtml(c.relationship)}</span>` : ''}
        </div>
        <div class="contact-card__actions">
          <button class="contact-card__btn contact-card__btn--edit" data-edit="${c.id}" aria-label="Edit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="contact-card__btn contact-card__btn--delete" data-delete="${c.id}" aria-label="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </div>
    `).join('');

    /* Edit buttons */
    container.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.edit, 10);
        const contact = getContacts().find(c => c.id === id);
        if (!contact) return;

        editingContactId = id;
        const title = document.getElementById('contactFormTitle');
        if (title) title.textContent = 'Edit Contact';
        const ni = document.getElementById('contactNameInput');
        const pi = document.getElementById('contactPhoneInput');
        const ei = document.getElementById('contactEmailInput');
        const ri = document.getElementById('contactRelInput');
        if (ni) ni.value = contact.name;
        if (pi) pi.value = contact.phone;
        if (ei) ei.value = contact.email || '';
        if (ri) ri.value = contact.relationship || '';
        showScreen('contactFormScreen');
      });
    });

    /* Delete buttons */
    container.querySelectorAll('[data-delete]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.delete, 10);
        const contacts = getContacts().filter(c => c.id !== id);
        saveContacts(contacts);
        renderContactsList();
        showToast('Contact removed');
      });
    });
  }

  /* ===== FEEDBACK ===== */
  function setupFeedback() {
    const stars = document.querySelectorAll('#starRating .star');

    stars.forEach(star => {
      star.addEventListener('click', () => {
        feedbackRating = parseInt(star.dataset.val, 10);
        stars.forEach(s => {
          s.classList.toggle('active', parseInt(s.dataset.val, 10) <= feedbackRating);
        });
      });
    });

    document.getElementById('feedbackForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      showToast('Thank you for your feedback!');
      e.target.reset();
      feedbackRating = 0;
      stars.forEach(s => s.classList.remove('active'));
      setTimeout(() => goBack(), 800);
    });
  }

  function resetFeedback() {
    feedbackRating = 0;
    document.querySelectorAll('#starRating .star').forEach(s => s.classList.remove('active'));
    document.getElementById('feedbackForm')?.reset();
  }

  /* ===== SHARE LOCATION ===== */
  function setupShareLocation() {
    /* Close share modal */
    document.getElementById('shareModalClose')?.addEventListener('click', closeShareModal);
    document.getElementById('shareModal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeShareModal();
    });
  }

  function openShareModal() {
    const modal = document.getElementById('shareModal');
    const list = document.getElementById('shareContactList');
    if (!modal || !list) return;

    const contacts = getContacts();

    if (contacts.length === 0) {
      list.innerHTML = '<p style="text-align:center;color:var(--text-m);padding:16px 0">Add emergency contacts first.</p>';
    } else {
      list.innerHTML = contacts.map(c => `
        <div class="share-contact-item" data-share-id="${c.id}">
          <div class="share-contact-item__avatar">${getInitials(c.name)}</div>
          <span class="share-contact-item__name">${escapeHtml(c.name)}${c.email ? '' : ' <span style=\"font-size:10px;color:var(--text-d)\">(no email)</span>'}</span>
          <span class="share-contact-item__action">${c.email ? '📧 Share' : '📤 Share'}</span>
        </div>
      `).join('');

      list.querySelectorAll('.share-contact-item').forEach(item => {
        item.addEventListener('click', () => {
          const id = parseInt(item.dataset.shareId, 10);
          const contact = getContacts().find(c => c.id === id);
          if (!contact) return;

          sharingWith = contact;
          closeShareModal();
          startSharing(contact);
        });
      });
    }

    modal.classList.add('active');
  }

  function closeShareModal() {
    document.getElementById('shareModal')?.classList.remove('active');
  }

  function startSharing(contact) {
    const banner = document.getElementById('shareBanner');
    const nameEl = document.getElementById('shareContactName');
    if (banner) banner.style.display = '';
    if (nameEl) nameEl.textContent = contact.name;

    /* ===== SEND LOCATION EMAIL ===== */
    const pos = MapModule.getUserPosition();
    const profile = getProfile();
    const userName = profile.name || 'A Leading Light user';
    const mapsLink = `https://www.google.com/maps?q=${pos.lat},${pos.lng}`;
    const now = new Date().toLocaleString();

    const subject = encodeURIComponent(`📍 ${userName} is sharing their location with you`);
    const body = encodeURIComponent(
      `📍 LOCATION SHARING — Leading Light\n\n` +
      `${userName} wants to share their current location with you.\n\n` +
      `🕐 Time: ${now}\n` +
      `📍 Coordinates: ${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}\n` +
      `🗺️ View on Google Maps: ${mapsLink}\n\n` +
      `They are using the Leading Light safety app. ` +
      `If you\'re concerned about their safety, please reach out to them.\n\n` +
      `— Sent via Leading Light Safety App`
    );

    if (contact.email) {
      const mailto = `mailto:${contact.email}?subject=${subject}&body=${body}`;
      window.open(mailto, '_blank');
      showToast(`Opening email to share location with ${contact.name}`);
    } else if (navigator.share) {
      navigator.share({
        title: `${userName}'s Location`,
        text: `${userName} is sharing their location: ${mapsLink}`,
        url: mapsLink
      }).then(() => {
        showToast(`Location shared with ${contact.name}`);
      }).catch(() => {
        showToast(`Sharing location with ${contact.name}`);
      });
    } else {
      /* Fallback: open mailto without a specific address */
      const mailto = `mailto:?subject=${subject}&body=${body}`;
      window.open(mailto, '_blank');
      showToast(`Opening email to share location (add ${contact.name}'s email in Contacts)`);
    }
  }

  function setupShareBanner() {
    document.getElementById('shareStop')?.addEventListener('click', () => {
      const banner = document.getElementById('shareBanner');
      if (banner) banner.style.display = 'none';
      sharingWith = null;
      showToast('Location sharing stopped');
    });
  }

  /* ===== TOAST ===== */
  function showToast(message) {
    let toast = document.querySelector('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('active');
    setTimeout(() => toast.classList.remove('active'), 2500);
  }

  /* ===== EXPOSE CONTACTS FOR OTHER MODULES ===== */
  function getContactsForSOS() {
    return getContacts();
  }

  /* ===== BOOTSTRAP ===== */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init, showScreen, goBack, getContactsForSOS, getContacts, showToast };
})();
