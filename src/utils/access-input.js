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

module.exports = { parseName, parsePermissionIds };
