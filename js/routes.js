/* ===== routes.js — Safer Route Suggestions ===== */

const RoutesModule = (() => {
  let routeLines = [];
  let activeRoute = null;

  /* Simulated route data — 3 options between two campus points */
  const SAMPLE_ROUTES = [
    {
      id: 'safest',
      name: 'S State → E Liberty → Main St',
      badge: 'Safest Route',
      badgeClass: 'safe',
      safetyScore: 92,
      safetyClass: 'high',
      time: '14 min',
      distance: '0.8 mi',
      recommended: true,
      color: '#00E676',
      coords: [
        [42.2808, -83.7430],
        [42.2810, -83.7440],
        [42.2818, -83.7450],
        [42.2825, -83.7455],
        [42.2830, -83.7460],
        [42.2835, -83.7465],
        [42.2838, -83.7475],
        [42.2835, -83.7485]
      ]
    },
    {
      id: 'fastest',
      name: 'S State → Packard St',
      badge: 'Fastest',
      badgeClass: 'fast',
      safetyScore: 71,
      safetyClass: 'medium',
      time: '9 min',
      distance: '0.5 mi',
      recommended: false,
      color: '#6C63FF',
      coords: [
        [42.2808, -83.7430],
        [42.2800, -83.7420],
        [42.2790, -83.7410],
        [42.2782, -83.7398],
        [42.2780, -83.7390],
        [42.2785, -83.7380]
      ]
    },
    {
      id: 'alternate',
      name: 'S University → Hill St',
      badge: 'Caution',
      badgeClass: 'caution',
      safetyScore: 48,
      safetyClass: 'low',
      time: '11 min',
      distance: '0.6 mi',
      recommended: false,
      color: '#FFD600',
      coords: [
        [42.2808, -83.7430],
        [42.2802, -83.7440],
        [42.2795, -83.7450],
        [42.2785, -83.7455],
        [42.2775, -83.7460],
        [42.2765, -83.7455]
      ]
    }
  ];

  function init() {
    renderRouteCards();
    bindEvents();
  }

  function renderRouteCards() {
    const container = document.getElementById('routeOptions');
    if (!container) return;

    container.innerHTML = SAMPLE_ROUTES.map(route => `
      <div class="route-card ${route.recommended ? 'route-card--recommended' : ''}" data-route-id="${route.id}">
        <div class="route-card__safety route-card__safety--${route.safetyClass}">
          ${route.safetyScore}
        </div>
        <div class="route-card__info">
          <span class="route-card__badge route-card__badge--${route.badgeClass}">${route.badge}</span>
          <div class="route-card__name">${route.name}</div>
          <div class="route-card__meta">${route.time} · ${route.distance}</div>
        </div>
        <svg class="route-card__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
    `).join('');
  }

  function bindEvents() {
    /* Route card clicks */
    document.getElementById('routeOptions')?.addEventListener('click', (e) => {
      const card = e.target.closest('.route-card');
      if (!card) return;
      const id = card.dataset.routeId;
      selectRoute(id);
    });

    /* Close button */
    document.getElementById('routePanelClose')?.addEventListener('click', closePanel);
  }

  function showPanel() {
    const panel = document.getElementById('routePanel');
    if (panel) {
      panel.classList.add('active');
      /* Hide search bar when routes are shown */
      document.querySelector('.search-bar')?.style.setProperty('transform', 'translateY(30px)');
    }
    drawAllRoutes();
  }

  function closePanel() {
    const panel = document.getElementById('routePanel');
    if (panel) panel.classList.remove('active');
    document.querySelector('.search-bar')?.style.removeProperty('transform');
    clearRoutes();
  }

  function drawAllRoutes() {
    clearRoutes();
    const map = MapModule.getMap();

    SAMPLE_ROUTES.forEach(route => {
      /* Draw dimmed line first */
      const line = L.polyline(route.coords, {
        color: route.color,
        weight: 4,
        opacity: route.recommended ? 0.8 : 0.3,
        dashArray: route.recommended ? null : '8, 6',
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);

      routeLines.push({ id: route.id, line });
    });

    /* Fit bounds to show all routes */
    const allCoords = SAMPLE_ROUTES.flatMap(r => r.coords);
    map.fitBounds(L.latLngBounds(allCoords).pad(0.15), { duration: 0.8 });
  }

  function selectRoute(routeId) {
    activeRoute = routeId;

    /* Highlight selected, dim others */
    routeLines.forEach(({ id, line }) => {
      if (id === routeId) {
        line.setStyle({ opacity: 0.9, weight: 5, dashArray: null });
        line.bringToFront();
      } else {
        line.setStyle({ opacity: 0.15, weight: 3 });
      }
    });

    /* Highlight card */
    document.querySelectorAll('.route-card').forEach(card => {
      card.style.borderColor = card.dataset.routeId === routeId
        ? 'var(--primary-light)'
        : '';
    });

    /* Fit to selected route */
    const route = SAMPLE_ROUTES.find(r => r.id === routeId);
    if (route) {
      MapModule.getMap().fitBounds(L.latLngBounds(route.coords).pad(0.2), { duration: 0.6 });
    }
  }

  function clearRoutes() {
    routeLines.forEach(({ line }) => line.remove());
    routeLines = [];
    activeRoute = null;
  }

  return { init, showPanel, closePanel };
})();
