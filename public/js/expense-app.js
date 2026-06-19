window.expenseStorage = {
  usersKey: 'expenseUsers',
  groupsKey: 'expenseGroups',
  itemsKey: 'expenseItems'
};

window.createId = function () {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
};

window.getExpenseUsers = function () {
  return JSON.parse(localStorage.getItem(window.expenseStorage.usersKey) || '[]');
};

window.saveExpenseUsers = function (users) {
  localStorage.setItem(window.expenseStorage.usersKey, JSON.stringify(users));
};

window.findExpenseUser = function (email) {
  return window.getExpenseUsers().find((user) => user.email.toLowerCase() === email.toLowerCase());
};

window.registerExpenseUser = function (email, password) {
  const existing = window.findExpenseUser(email);
  if (existing) {
    return { error: 'That email is already registered.' };
  }

  const user = {
    id: window.createId(),
    email,
    name: email.split('@')[0],
    password,
    createdAt: new Date().toISOString()
  };

  window.saveExpenseUsers([...window.getExpenseUsers(), user]);
  return { user };
};

window.loginExpenseUser = function (email, password) {
  const user = window.findExpenseUser(email);
  if (!user || user.password !== password) {
    return { error: 'Invalid email or password.' };
  }
  return { user };
};

window.getExpenseGroups = function () {
  return JSON.parse(localStorage.getItem(window.expenseStorage.groupsKey) || '[]');
};

window.saveExpenseGroups = function (groups) {
  localStorage.setItem(window.expenseStorage.groupsKey, JSON.stringify(groups));
};

window.getGroupById = function (groupId) {
  return window.getExpenseGroups().find((group) => group.id === groupId) || null;
};

window.getUserGroups = function (user) {
  const email = user.email.toLowerCase();
  return window.getExpenseGroups().filter((group) =>
    group.members.some((member) => member.toLowerCase() === email)
  );
};

window.createExpenseGroup = function (owner, name, members) {
  const trimmedName = name.trim();
  const normalizedMembers = Array.from(new Set([owner.email, ...members
    .map((m) => m.trim())
    .filter(Boolean)
    .map((m) => m.toLowerCase())]));

  const group = {
    id: window.createId(),
    name: trimmedName,
    ownerId: owner.id,
    members: normalizedMembers,
    createdAt: new Date().toISOString()
  };

  window.saveExpenseGroups([...window.getExpenseGroups(), group]);
  return group;
};

window.getExpenseItems = function () {
  return JSON.parse(localStorage.getItem(window.expenseStorage.itemsKey) || '[]');
};

window.saveExpenseItems = function (items) {
  localStorage.setItem(window.expenseStorage.itemsKey, JSON.stringify(items));
};

window.getExpensesByGroup = function (groupId) {
  return window.getExpenseItems().filter((expense) => expense.groupId === groupId);
};

window.addExpenseItem = function (groupId, description, amount, paidBy, splitBetween) {
  const expense = {
    id: window.createId(),
    groupId,
    description: description.trim(),
    amount: Number(amount) || 0,
    paidBy,
    splitBetween,
    createdAt: new Date().toISOString()
  };

  window.saveExpenseItems([...window.getExpenseItems(), expense]);
  return expense;
};

window.requireExpenseAuth = function () {
  const user = window.requireAuth('login.html');
  if (!user) {
    return null;
  }
  return user;
};

window.logoutExpense = function () {
  window.clearCurrentUser();
  window.location.href = 'login.html';
};

window.computeGroupTotals = function (groupId) {
  const items = window.getExpensesByGroup(groupId);
  const total = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return {
    count: items.length,
    total: total
  };
};

window.computeGroupBalances = function (groupId) {
  const group = window.getGroupById(groupId);
  if (!group) {
    return [];
  }
  const items = window.getExpensesByGroup(groupId);
  const balances = group.members.reduce((memo, email) => {
    memo[email] = 0;
    return memo;
  }, {});

  items.forEach((expense) => {
    const amount = Number(expense.amount || 0);
    const split = Array.isArray(expense.splitBetween) && expense.splitBetween.length > 0
      ? expense.splitBetween
      : group.members;
    const share = amount / Math.max(split.length, 1);

    split.forEach((member) => {
      if (balances[member] === undefined) {
        balances[member] = 0;
      }
      balances[member] -= share;
    });

    if (balances[expense.paidBy] === undefined) {
      balances[expense.paidBy] = 0;
    }
    balances[expense.paidBy] += amount;
  });

  return Object.entries(balances).map(([email, amount]) => ({
    email,
    name: email.split('@')[0],
    amount
  }));
};

window.formatExpenseAmount = function (value) {
  return window.formatCurrency(value);
};

window.formatExpenseDate = function (dateString) {
  if (!dateString) return '';
  return window.formatDate(dateString);
};
