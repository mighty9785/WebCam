const SUPABASE_URL = 'https://jszvcbbobpkexriwkrai.supabase.co';
const SUPABASE_ANON_KEY = '<eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzenZjYmJvYnBrZXhyaXdrcmFpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4Nzg3NTcsImV4cCI6MjA5NzQ1NDc1N30.98XRE_Pa_lk_KN-m_u98mlJYrNY8jYiCO96uwa2ReGI>';

window.supabaseClient = null;

window.initSupabaseClient = function () {
  if (!window.supabaseClient) {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return window.supabaseClient;
};

window.getCurrentUser = function () {
  const stored = localStorage.getItem('expenseUser');
  return stored ? JSON.parse(stored) : null;
};

window.setCurrentUser = function (user) {
  localStorage.setItem('expenseUser', JSON.stringify(user));
};

window.clearCurrentUser = function () {
  localStorage.removeItem('expenseUser');
};

window.requireAuth = function (redirect = 'login.html') {
  const user = window.getCurrentUser();
  if (!user) {
    window.location.href = redirect;
    return null;
  }
  return user;
};

window.formatCurrency = function (value) {
  const amount = Number(value) || 0;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
};

window.formatDate = function (dateString) {
  const d = new Date(dateString);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

window.getParam = function (key) {
  const params = new URLSearchParams(window.location.search);
  return params.get(key);
};
