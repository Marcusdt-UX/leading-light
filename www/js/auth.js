/* ===== auth.js — Account & Authentication Module ===== */
/* Uses localStorage + SubtleCrypto SHA-256 for a fully client-side auth system. */

const AuthModule = (() => {
  const ACCOUNTS_KEY = 'leadinglight_accounts';
  const SESSION_KEY  = 'leadinglight_session';

  /* ===== CRYPTO HELPERS ===== */
  async function hashPassword(password, salt) {
    const data = new TextEncoder().encode(salt + ':' + password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function generateSalt() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function generateToken() {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /* ===== ACCOUNTS STORE ===== */
  function getAccounts() {
    try {
      return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) || [];
    } catch { return []; }
  }

  function saveAccounts(accounts) {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  }

  function findAccountByEmail(email) {
    return getAccounts().find(a => a.email.toLowerCase() === email.toLowerCase());
  }

  /* ===== SESSION ===== */
  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY));
    } catch { return null; }
  }

  function saveSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function isLoggedIn() {
    const session = getSession();
    if (!session || !session.token || !session.email) return false;
    /* Check account still exists */
    return !!findAccountByEmail(session.email);
  }

  function getCurrentUser() {
    const session = getSession();
    if (!session) return null;
    const account = findAccountByEmail(session.email);
    if (!account) return null;
    return { name: account.name, email: account.email, createdAt: account.createdAt };
  }

  /* ===== SIGN UP ===== */
  async function signup(name, email, password, confirmPassword) {
    /* Validation */
    name = (name || '').trim();
    email = (email || '').trim();

    if (!name) return { ok: false, error: 'Please enter your name.' };
    if (!email) return { ok: false, error: 'Please enter your email.' };
    if (!isValidEmail(email)) return { ok: false, error: 'Please enter a valid email address.' };
    if (!password || password.length < 6) return { ok: false, error: 'Password must be at least 6 characters.' };
    if (password !== confirmPassword) return { ok: false, error: 'Passwords do not match.' };

    /* Check if email already registered */
    if (findAccountByEmail(email)) {
      return { ok: false, error: 'An account with this email already exists.' };
    }

    /* Create account */
    const salt = generateSalt();
    const hash = await hashPassword(password, salt);
    const account = {
      id: generateToken().slice(0, 16),
      name,
      email: email.toLowerCase(),
      salt,
      hash,
      createdAt: new Date().toISOString()
    };

    const accounts = getAccounts();
    accounts.push(account);
    saveAccounts(accounts);

    /* Auto-login */
    const token = generateToken();
    saveSession({ email: account.email, token, loggedInAt: new Date().toISOString() });

    console.log('[Auth] Account created for', email);
    return { ok: true, user: { name: account.name, email: account.email } };
  }

  /* ===== LOG IN ===== */
  async function login(email, password) {
    email = (email || '').trim();

    if (!email) return { ok: false, error: 'Please enter your email.' };
    if (!password) return { ok: false, error: 'Please enter your password.' };

    const account = findAccountByEmail(email);
    if (!account) {
      return { ok: false, error: 'No account found with that email.' };
    }

    const hash = await hashPassword(password, account.salt);
    if (hash !== account.hash) {
      return { ok: false, error: 'Incorrect password.' };
    }

    /* Create session */
    const token = generateToken();
    saveSession({ email: account.email, token, loggedInAt: new Date().toISOString() });

    console.log('[Auth] Logged in as', email);
    return { ok: true, user: { name: account.name, email: account.email } };
  }

  /* ===== LOG OUT ===== */
  function logout() {
    clearSession();
    console.log('[Auth] Logged out');
  }

  /* ===== CHANGE PASSWORD ===== */
  async function changePassword(currentPassword, newPassword, confirmNewPassword) {
    if (!isLoggedIn()) return { ok: false, error: 'You are not logged in.' };

    const session = getSession();
    const accounts = getAccounts();
    const idx = accounts.findIndex(a => a.email.toLowerCase() === session.email.toLowerCase());
    if (idx === -1) return { ok: false, error: 'Account not found.' };

    const account = accounts[idx];

    /* Verify current password */
    const currentHash = await hashPassword(currentPassword, account.salt);
    if (currentHash !== account.hash) {
      return { ok: false, error: 'Current password is incorrect.' };
    }

    /* Validate new password */
    if (!newPassword || newPassword.length < 6) {
      return { ok: false, error: 'New password must be at least 6 characters.' };
    }
    if (newPassword !== confirmNewPassword) {
      return { ok: false, error: 'New passwords do not match.' };
    }
    if (newPassword === currentPassword) {
      return { ok: false, error: 'New password must be different from current password.' };
    }

    /* Update password */
    const newSalt = generateSalt();
    const newHash = await hashPassword(newPassword, newSalt);
    accounts[idx].salt = newSalt;
    accounts[idx].hash = newHash;
    saveAccounts(accounts);

    console.log('[Auth] Password changed for', account.email);
    return { ok: true };
  }

  /* ===== FORGOT PASSWORD / RESET ===== */
  async function resetPassword(email, newPassword, confirmNewPassword) {
    email = (email || '').trim();

    if (!email) return { ok: false, error: 'Please enter your email.' };
    if (!isValidEmail(email)) return { ok: false, error: 'Please enter a valid email.' };

    const accounts = getAccounts();
    const idx = accounts.findIndex(a => a.email.toLowerCase() === email.toLowerCase());
    if (idx === -1) {
      return { ok: false, error: 'No account found with that email.' };
    }

    if (!newPassword || newPassword.length < 6) {
      return { ok: false, error: 'New password must be at least 6 characters.' };
    }
    if (newPassword !== confirmNewPassword) {
      return { ok: false, error: 'Passwords do not match.' };
    }

    /* Reset password */
    const newSalt = generateSalt();
    const newHash = await hashPassword(newPassword, newSalt);
    accounts[idx].salt = newSalt;
    accounts[idx].hash = newHash;
    saveAccounts(accounts);

    console.log('[Auth] Password reset for', email);
    return { ok: true };
  }

  /* ===== UPDATE PROFILE ===== */
  function updateAccountName(newName) {
    if (!isLoggedIn()) return false;
    const session = getSession();
    const accounts = getAccounts();
    const idx = accounts.findIndex(a => a.email.toLowerCase() === session.email.toLowerCase());
    if (idx === -1) return false;

    accounts[idx].name = newName;
    saveAccounts(accounts);
    return true;
  }

  /* ===== DELETE ACCOUNT ===== */
  function deleteAccount() {
    if (!isLoggedIn()) return false;
    const session = getSession();
    const accounts = getAccounts().filter(a => a.email.toLowerCase() !== session.email.toLowerCase());
    saveAccounts(accounts);
    clearSession();
    console.log('[Auth] Account deleted');
    return true;
  }

  /* ===== HELPERS ===== */
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  /* ===== PUBLIC API ===== */
  return {
    signup,
    login,
    logout,
    isLoggedIn,
    getCurrentUser,
    changePassword,
    resetPassword,
    updateAccountName,
    deleteAccount
  };
})();
