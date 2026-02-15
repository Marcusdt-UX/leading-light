/* ===== app.js — Main Application Controller ===== */

const App = (() => {
  function init() {
    /* Initialize all modules */
    MapModule.init();
    RoutesModule.init();
    EmergencyModule.init();
    ReportsModule.init();

    /* App-level bindings */
    setupDrawer();
    setupSearch();
    setupLocateButton();

    console.log('[LeadingLight] App initialized');
  }

  /* ===== DRAWER ===== */
  function setupDrawer() {
    const menuBtn = document.getElementById('menuBtn');
    const drawer = document.getElementById('drawer');
    const overlay = document.getElementById('drawerOverlay');

    function openDrawer() {
      drawer?.classList.add('active');
      overlay?.classList.add('active');
    }

    function closeDrawer() {
      drawer?.classList.remove('active');
      overlay?.classList.remove('active');
    }

    menuBtn?.addEventListener('click', openDrawer);
    overlay?.addEventListener('click', closeDrawer);

    /* Close drawer on link click */
    document.querySelectorAll('.drawer__link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        closeDrawer();

        const action = link.dataset.action;
        if (action === 'routes') {
          RoutesModule.showPanel();
        }
      });
    });

    /* Close drawer on Escape */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeDrawer();
        closeSOS();
        closeReport();
      }
    });

    function closeSOS() {
      document.getElementById('sosModal')?.classList.remove('active');
    }
    function closeReport() {
      document.getElementById('reportModal')?.classList.remove('active');
    }
  }

  /* ===== SEARCH ===== */
  function setupSearch() {
    const input = document.getElementById('searchInput');
    const suggestions = document.getElementById('searchSuggestions');

    const PLACES = [
      { name: 'Michigan Union', address: '530 S State St', emoji: '🏛️', lat: 42.2750, lng: -83.7417 },
      { name: 'Shapiro Library', address: '919 S University Ave', emoji: '📚', lat: 42.2752, lng: -83.7384 },
      { name: 'The Diag', address: 'Central Campus', emoji: '🌳', lat: 42.2770, lng: -83.7382 },
      { name: 'Michigan Stadium', address: '1201 S Main St', emoji: '🏟️', lat: 42.2658, lng: -83.7486 },
      { name: 'North Campus', address: '2281 Bonisteel Blvd', emoji: '🎓', lat: 42.2929, lng: -83.7156 },
      { name: 'Kerrytown Market', address: '407 N Fifth Ave', emoji: '🛒', lat: 42.2860, lng: -83.7498 }
    ];

    if (!input || !suggestions) return;

    input.addEventListener('input', () => {
      const q = input.value.toLowerCase().trim();
      if (q.length < 2) {
        suggestions.classList.remove('active');
        return;
      }

      const matches = PLACES.filter(p =>
        p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q)
      );

      if (matches.length === 0) {
        suggestions.classList.remove('active');
        return;
      }

      suggestions.innerHTML = matches.map(p => `
        <div class="suggestion" data-lat="${p.lat}" data-lng="${p.lng}">
          <div class="suggestion__icon">${p.emoji}</div>
          <div class="suggestion__text">
            <span class="suggestion__name">${p.name}</span>
            <span class="suggestion__address">${p.address}</span>
          </div>
        </div>
      `).join('');

      suggestions.classList.add('active');
    });

    /* Click suggestion → fly to location & show routes */
    suggestions.addEventListener('click', (e) => {
      const item = e.target.closest('.suggestion');
      if (!item) return;

      const lat = parseFloat(item.dataset.lat);
      const lng = parseFloat(item.dataset.lng);

      input.value = item.querySelector('.suggestion__name').textContent;
      suggestions.classList.remove('active');

      MapModule.flyTo([lat, lng], 16);

      /* Show route panel after short delay */
      setTimeout(() => RoutesModule.showPanel(), 600);
    });

    /* Close suggestions on outside click */
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-bar')) {
        suggestions.classList.remove('active');
      }
    });

    /* Blur on Enter */
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        input.blur();
        suggestions.classList.remove('active');
      }
    });
  }

  /* ===== LOCATE BUTTON ===== */
  function setupLocateButton() {
    document.getElementById('locateBtn')?.addEventListener('click', () => {
      MapModule.locateUser();

      /* Brief visual feedback */
      const btn = document.getElementById('locateBtn');
      btn.style.background = 'var(--primary)';
      setTimeout(() => btn.style.background = '', 400);
    });
  }

  /* Boot the app when DOM is ready */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init };
})();
