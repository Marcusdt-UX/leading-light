/* ===== reports.js — Community Safety Reporting ===== */

const ReportsModule = (() => {
  const CATEGORIES = {
    'poor-lighting':  { emoji: '💡', label: 'Poor Lighting' },
    'harassment':     { emoji: '🚨', label: 'Harassment' },
    'unsafe-road':    { emoji: '⚠️', label: 'Unsafe Road' },
    'suspicious':     { emoji: '👁️', label: 'Suspicious Activity' },
    'closed-path':    { emoji: '🚧', label: 'Closed Path' },
    'other':          { emoji: '📋', label: 'Other' }
  };

  function init() {
    bindEvents();
  }

  function bindEvents() {
    /* Report button opens modal */
    document.getElementById('reportBtn')?.addEventListener('click', openModal);

    /* Close button */
    document.querySelector('#reportModal .modal__close')?.addEventListener('click', closeModal);

    /* Overlay click to close */
    document.getElementById('reportModal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });

    /* Category option clicks */
    document.querySelectorAll('.report-option').forEach(opt => {
      opt.addEventListener('click', () => {
        const category = opt.dataset.category;
        submitReport(category);
      });
    });
  }

  function openModal() {
    const modal = document.getElementById('reportModal');
    if (!modal) return;

    resetState();
    modal.classList.add('active');
  }

  function closeModal() {
    const modal = document.getElementById('reportModal');
    if (!modal) return;

    modal.classList.remove('active');

    /* Reset after transition */
    setTimeout(resetState, 350);
  }

  function submitReport(category) {
    const cat = CATEGORIES[category];
    if (!cat) return;

    /* Haptic feedback */
    if (navigator.vibrate) navigator.vibrate(80);

    /* Hide grid, show confirmation */
    const grid = document.querySelector('.report-grid');
    const confirm = document.querySelector('.report-confirm');

    if (grid) grid.style.display = 'none';
    if (confirm) {
      confirm.classList.add('active');
      confirm.querySelector('.report-confirm__icon').textContent = cat.emoji;
      confirm.querySelector('.report-confirm__text').textContent =
        `${cat.label} reported — thank you for keeping the community safe.`;
    }

    /* Add marker to map at user's position */
    const pos = MapModule.getUserPosition();
    MapModule.addReportMarker(
      [pos.lat + (Math.random() - 0.5) * 0.002, pos.lng + (Math.random() - 0.5) * 0.002],
      cat.label,
      cat.emoji
    );

    console.log('[Report] Category:', cat.label, 'Location:', pos);

    /* Auto-close after 2.5s */
    setTimeout(closeModal, 2500);
  }

  function resetState() {
    const grid = document.querySelector('.report-grid');
    const confirm = document.querySelector('.report-confirm');

    if (grid) grid.style.display = '';
    if (confirm) confirm.classList.remove('active');
  }

  return { init, openModal, closeModal };
})();
