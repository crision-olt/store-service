const parseName = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100) {
    return { error: 'name must be a non-empty string of at most 100 characters' };
  }
  return { name: body.name.trim() };
};

const parsePermissionIds = (value) => {
  if (!Array.isArray(value) || value.some((id) => !Number.isInteger(id) || id < 1 || id > 2147483647) ||
      new Set(value).size !== value.length) {
    return { error: 'permissionIds must be an array of distinct positive integer IDs' };
  }
  return { permissionIds: value };
};

const parseId = (value) => {
  const id = Number(value);
  return /^\d+$/.test(String(value)) && id >= 1 && id <= 2147483647 ? id : null;
};

const isId = (value) => Number.isInteger(value) && value >= 1 && value <= 2147483647;

// Passwords are optional on update; blank means "keep the current one".
const parseUserInput = (body, { passwordRequired }) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Invalid request body' };
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    return { error: 'email must be a valid email address of at most 255 characters' };
  }
  if (!isId(body.roleId)) return { error: 'roleId must be a positive integer ID' };
  const hasPassword = typeof body.password === 'string' && body.password !== '';
  if (body.password !== undefined && typeof body.password !== 'string') {
    return { error: 'password must be a string' };
  }
  if ((passwordRequired || hasPassword) && (!hasPassword || body.password.length < 8 || body.password.length > 72)) {
    return { error: 'password must be between 8 and 72 characters' };
  }
  return { email, roleId: body.roleId, password: hasPassword ? body.password : undefined };
};

module.exports = { parseName, parsePermissionIds, parseId, parseUserInput };
