const ADMIN_EMAIL = "beyle931224@gmail.com";

function adminRequired() {
  throw new Error("admin-required");
}

export function requireAdminAuth(auth) {
  const token = auth?.token;
  if (
    token?.email !== ADMIN_EMAIL
    || token.email_verified !== true
    || token.firebase?.sign_in_provider !== "google.com"
  ) {
    adminRequired();
  }
  return auth;
}
