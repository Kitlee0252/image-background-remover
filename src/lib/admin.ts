const ADMIN_EMAIL = "lee.xiaoxiong@gmail.com";

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}
