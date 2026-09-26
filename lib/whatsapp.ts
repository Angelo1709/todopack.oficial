/** Deja solo dígitos y lleva un teléfono argentino a formato internacional para wa.me (549 + área + número). */
export function normalizeWhatsAppNumber(raw: string) {
  let digits = raw.replace(/\D/g, "")
  if (digits.startsWith("00")) digits = digits.slice(2)
  if (digits.startsWith("0")) digits = digits.slice(1)
  if (digits.length === 10) return `549${digits}`
  if (digits.startsWith("54") && !digits.startsWith("549") && digits.length === 12) {
    return `549${digits.slice(2)}`
  }
  return digits
}

export function whatsappUrl(number: string, message: string) {
  return `https://wa.me/${normalizeWhatsAppNumber(number)}?text=${encodeURIComponent(message)}`
}
