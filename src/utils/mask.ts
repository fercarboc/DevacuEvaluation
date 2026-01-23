export function maskEmail(email?: string | null) {
  if (!email) return "";
  const [user, domain] = email.split("@");
  if (!domain) return "***";
  const maskedUser = user.length <= 1 ? "*" : `${user[0]}***${user.slice(-1)}`;
  return `${maskedUser}@${domain}`;
}

export function maskPhone(phone?: string | null) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  return digits.length <= 3 ? `***${digits}` : `***${digits.slice(-3)}`;
}
