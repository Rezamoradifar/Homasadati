// Explicit, short-lived server setting for initial superadmin setup only.
// The API still verifies the password, role, blocked state and second factor.
export function temporaryAdminPasswordLogin() {
  const value = process.env.TEMP_ADMIN_PASSWORD_LOGIN_UNTIL;
  if (!value) return false;
  const remaining = Date.parse(value) - Date.now();
  return (
    Number.isFinite(remaining) &&
    remaining > 0 &&
    remaining <= 24 * 60 * 60 * 1000
  );
}
