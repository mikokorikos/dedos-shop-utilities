export function userIsAdmin(member, adminRoleId) {
  if (!member) return false;
  if (member.id === member.guild?.ownerId) return true;
  return member.roles?.cache?.has(adminRoleId) ?? false;
}

export function requireAdmin(member, adminRoleId) {
  if (userIsAdmin(member, adminRoleId)) return true;
  throw new Error('PERMISSION_DENIED');
}
