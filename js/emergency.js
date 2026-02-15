/* ===== emergency.js — One-Tap Emergency SOS ===== */

const EmergencyModule = (() => {
  let countdownInterval = null;
  let countdownValue = 5;

  const CONTACTS = [
    { name: 'Mom', initials: 'M', number: '(555) 123-4567' },
    { name: 'Jake (Roommate)', initials: 'J', number: '(555) 987-6543' }
  ];

  function init() {
    bindEvents();
  }

  function bindEvents() {
    /* SOS button */
    document.getElementById('sosBtn')?.addEventListener('click', openSOS);

    /* Send Now */
    document.getElementById('sosSendNow')?.addEventListener('click', sendAlert);

    /* Cancel */
    document.getElementById('sosCancel')?.addEventListener('click', closeSOS);

    /* Close button */
    document.querySelector('#sosModal .modal__close')?.addEventListener('click', closeSOS);

    /* Close on overlay click */
    document.getElementById('sosModal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeSOS();
    });
  }

  function openSOS() {
    const modal = document.getElementById('sosModal');
    if (!modal) return;

    /* Reset state */
    resetState();
    modal.classList.add('active');

    /* Haptic feedback if available */
    if (navigator.vibrate) navigator.vibrate(100);

    /* Start countdown */
    startCountdown();
  }

  function closeSOS() {
    const modal = document.getElementById('sosModal');
    if (!modal) return;

    stopCountdown();
    modal.classList.remove('active');
    resetState();
  }

  function startCountdown() {
    countdownValue = 5;
    updateCountdownDisplay();

    countdownInterval = setInterval(() => {
      countdownValue--;
      updateCountdownDisplay();

      /* Haptic tick */
      if (navigator.vibrate) navigator.vibrate(50);

      if (countdownValue <= 0) {
        stopCountdown();
        sendAlert();
      }
    }, 1000);
  }

  function stopCountdown() {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }

  function updateCountdownDisplay() {
    const el = document.getElementById('sosCountdownNumber');
    if (el) el.textContent = countdownValue;
  }

  function sendAlert() {
    stopCountdown();

    /* Hide countdown content, show sent confirmation */
    const sosContent = document.getElementById('sosCountdownContent');
    const sosSent = document.getElementById('sosSent');

    if (sosContent) sosContent.style.display = 'none';
    if (sosSent) sosSent.classList.add('active');

    /* Strong haptic feedback */
    if (navigator.vibrate) navigator.vibrate([100, 50, 200]);

    /* Auto-close after 3 seconds */
    setTimeout(() => {
      closeSOS();
    }, 3000);

    /* In a real app, this would:
     * 1. Send SMS with location to emergency contacts
     * 2. Share live location
     * 3. Optionally call 911
     */
    console.log('[SOS] Alert sent to contacts:', CONTACTS.map(c => c.name).join(', '));
    console.log('[SOS] Location:', MapModule.getUserPosition());
  }

  function resetState() {
    const sosContent = document.getElementById('sosCountdownContent');
    const sosSent = document.getElementById('sosSent');

    if (sosContent) sosContent.style.display = '';
    if (sosSent) sosSent.classList.remove('active');

    countdownValue = 5;
    updateCountdownDisplay();
  }

  return { init, openSOS, closeSOS };
})();
