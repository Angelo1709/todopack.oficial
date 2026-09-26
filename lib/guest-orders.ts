// Pedidos hechos sin cuenta desde este navegador (localStorage) y precarga del registro (sessionStorage).
// Las funciones de storage solo corren en el cliente; isOrderToken también se usa en el servidor.

const ORDERS_KEY = "todopack-orders-v1"
const SIGN_UP_PREFILL_KEY = "todopack-signup-prefill-v1"

/** Máximo de pedidos recordados por navegador (y de tokens aceptados por las server actions). */
export const MAX_REMEMBERED_ORDERS = 20

const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/

/** Formato de orders.public_token (randomBytes(16) en base64url). */
export function isOrderToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_RE.test(value)
}

export function getRememberedOrderTokens(): string[] {
  try {
    const raw = localStorage.getItem(ORDERS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(isOrderToken).slice(0, MAX_REMEMBERED_ORDERS) : []
  } catch {
    return []
  }
}

function saveTokens(tokens: string[]) {
  try {
    if (tokens.length) localStorage.setItem(ORDERS_KEY, JSON.stringify(tokens))
    else localStorage.removeItem(ORDERS_KEY)
  } catch {
    // sin storage (modo privado, bloqueado): no pasa nada, el pedido igual se ve por su link
  }
}

/** Guarda el token al principio de la lista (el más reciente primero). */
export function rememberOrderToken(token: string) {
  if (!isOrderToken(token)) return
  const rest = getRememberedOrderTokens().filter((t) => t !== token)
  saveTokens([token, ...rest].slice(0, MAX_REMEMBERED_ORDERS))
}

export function forgetOrderTokens(tokens: string[]) {
  if (!tokens.length) return
  const drop = new Set(tokens)
  saveTokens(getRememberedOrderTokens().filter((t) => !drop.has(t)))
}

export type SignUpPrefill = { name?: string; phone?: string; email?: string; address?: string }

/** Datos del último pedido para precargar /sign-up (nunca por URL). */
export function saveSignUpPrefill(data: SignUpPrefill) {
  try {
    sessionStorage.setItem(SIGN_UP_PREFILL_KEY, JSON.stringify(data))
  } catch {
    // ignorar
  }
}

export function readSignUpPrefill(): SignUpPrefill | null {
  try {
    const raw = sessionStorage.getItem(SIGN_UP_PREFILL_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return null
    const out: SignUpPrefill = {}
    for (const key of ["name", "phone", "email", "address"] as const) {
      const value = (parsed as Record<string, unknown>)[key]
      if (typeof value === "string") out[key] = value
    }
    return out
  } catch {
    return null
  }
}

export function clearSignUpPrefill() {
  try {
    sessionStorage.removeItem(SIGN_UP_PREFILL_KEY)
  } catch {
    // ignorar
  }
}
