"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createUser, resetUserPassword, setUserRole, type AssignableRole } from "@/app/actions/users"
import { ROLE_LABEL, type Role } from "@/lib/roles"
import { formatDateAR } from "@/lib/dates"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Check, Copy, KeyRound, Phone, ShieldCheck, User as UserIcon, UserPlus, Users } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type UserRow = {
  id: string
  name: string
  email: string
  role: string
  phone: string | null
  createdAt: Date
  orders: number
}

const FILTERS = [
  { value: "todos", label: "Todos" },
  { value: "admins", label: "Administradores" },
  { value: "clientes", label: "Clientes" },
] as const

// Sin caracteres que se confunden al dictarlos (0/O, 1/l/I).
const PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"

function generatePassword(length = 10) {
  const values = crypto.getRandomValues(new Uint32Array(length))
  return Array.from(values, (v) => PASSWORD_ALPHABET[v % PASSWORD_ALPHABET.length]).join("")
}

function roleVariant(role: string): "default" | "secondary" | "outline" {
  if (role === "superadmin") return "default"
  if (role === "admin") return "secondary"
  return "outline"
}

function accessText(email: string, password: string) {
  return `Tus datos para ingresar a TodoPack Alcorta:\nEmail: ${email}\nContraseña: ${password}\nIngresá en ${window.location.origin}/sign-in`
}

function CopyAccessButton({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(accessText(email, password))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("No se pudo copiar")
    }
  }

  return (
    <Button type="button" variant="outline" onClick={copy} className="w-full">
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copied ? "Copiado" : "Copiar datos de acceso"}
    </Button>
  )
}

function PasswordField({
  id,
  value,
  onChange,
}: {
  id: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Contraseña</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          minLength={8}
          required
          autoComplete="new-password"
          className="font-mono"
        />
        <Button type="button" variant="outline" onClick={() => onChange(generatePassword())}>
          Generar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Mínimo 8 caracteres. Después la podés compartir por WhatsApp.</p>
    </div>
  )
}

function NewUserDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState<AssignableRole>("admin")
  const [password, setPassword] = useState("")
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setRole("admin")
      setPassword(generatePassword())
      setCreated(null)
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const email = String(fd.get("email") || "").trim().toLowerCase()
    startTransition(async () => {
      try {
        const res = await createUser({
          name: String(fd.get("name") || ""),
          email,
          phone: String(fd.get("phone") || ""),
          password,
          role,
        })
        if (!res.ok) {
          toast.error(res.error)
          return
        }
        toast.success("Usuario creado")
        setCreated({ email, password })
        router.refresh()
      } catch {
        toast.error("No se pudo crear el usuario")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button className="gap-2" />}>
        <UserPlus className="size-4" /> Nuevo usuario
      </DialogTrigger>
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Usuario creado</DialogTitle>
              <DialogDescription>Pasale estos datos para que ingrese. Puede cambiar la contraseña después.</DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
              <dt>Email</dt>
              <dd className="font-mono text-foreground">{created.email}</dd>
              <dt>Contraseña</dt>
              <dd className="font-mono text-foreground">{created.password}</dd>
            </dl>
            <CopyAccessButton email={created.email} password={created.password} />
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Listo</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Nuevo usuario</DialogTitle>
              <DialogDescription>Creá la cuenta del dueño, de alguien del equipo o de un cliente.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="new-name">Nombre y apellido</Label>
                <Input id="new-name" name="name" required autoComplete="off" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-email">Email</Label>
                <Input id="new-email" name="email" type="email" required autoComplete="off" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-phone">Teléfono (opcional)</Label>
                <Input id="new-phone" name="phone" type="tel" autoComplete="off" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Rol</span>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    { value: "admin", icon: ShieldCheck, help: "Gestiona pedidos y catálogo" },
                    { value: "customer", icon: UserIcon, help: "Compra y ve sus pedidos" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRole(opt.value)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                      role === opt.value ? "border-primary bg-primary/5" : "border-border",
                    )}
                  >
                    <opt.icon className="size-5 text-primary" />
                    <div>
                      <p className="text-sm font-medium">{ROLE_LABEL[opt.value]}</p>
                      <p className="text-xs text-muted-foreground">{opt.help}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <PasswordField id="new-password" value={password} onChange={setPassword} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Creando..." : "Crear usuario"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordDialog({ user }: { user: UserRow }) {
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setPassword(generatePassword())
      setDone(false)
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    startTransition(async () => {
      try {
        const res = await resetUserPassword(user.id, password)
        if (!res.ok) {
          toast.error(res.error)
          return
        }
        toast.success("Contraseña actualizada")
        setDone(true)
      } catch {
        toast.error("No se pudo cambiar la contraseña")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <KeyRound className="size-3.5" /> Contraseña
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar contraseña</DialogTitle>
          <DialogDescription>
            {user.name} · {user.email}
          </DialogDescription>
        </DialogHeader>
        {done ? (
          <>
            <p className="text-sm text-muted-foreground">
              Listo. Se cerraron sus sesiones abiertas: tiene que ingresar con la contraseña nueva.
            </p>
            <CopyAccessButton email={user.email} password={password} />
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Listo</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <PasswordField id={`password-${user.id}`} value={password} onChange={setPassword} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando..." : "Guardar contraseña"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function UsersPanel({ users, currentUserId }: { users: UserRow[]; currentUserId: string }) {
  const router = useRouter()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("todos")
  const [pending, startTransition] = useTransition()

  const visible = users.filter((u) => {
    if (filter === "admins") return u.role === "admin" || u.role === "superadmin"
    if (filter === "clientes") return u.role === "customer"
    return true
  })

  function changeRole(u: UserRow, role: AssignableRole) {
    startTransition(async () => {
      try {
        const res = await setUserRole(u.id, role)
        if (!res.ok) {
          toast.error(res.error)
          return
        }
        toast.success(role === "admin" ? `${u.name} ahora es administrador` : `${u.name} ahora es cliente`)
        router.refresh()
      } catch {
        toast.error("No se pudo cambiar el rol")
      }
    })
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold">Usuarios</h1>
          <p className="text-sm text-muted-foreground">
            Creá cuentas para el equipo o los clientes y definí quién puede usar el panel.
          </p>
        </div>
        <NewUserDialog />
      </div>

      <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              "whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition-colors",
              filter === f.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-16 text-center text-muted-foreground">
          <Users className="size-10 opacity-40" />
          <p>No hay usuarios en este filtro.</p>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {visible.map((u) => {
            const isMe = u.id === currentUserId
            const locked = isMe || u.role === "superadmin"
            return (
              <li key={u.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {u.name} {isMe && <span className="text-sm font-normal text-muted-foreground">(vos)</span>}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                    {u.phone && (
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Phone className="size-3.5" /> {u.phone}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Alta: {formatDateAR(new Date(u.createdAt).toISOString().slice(0, 10))} ·{" "}
                      {u.orders} pedido{u.orders === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Badge variant={roleVariant(u.role)}>{ROLE_LABEL[u.role as Role] ?? u.role}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-border pt-3">
                  {!locked &&
                    (u.role === "admin" ? (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => changeRole(u, "customer")}>
                        Quitar administrador
                      </Button>
                    ) : (
                      <Button size="sm" variant="secondary" disabled={pending} onClick={() => changeRole(u, "admin")}>
                        <ShieldCheck className="size-3.5" /> Hacer administrador
                      </Button>
                    ))}
                  {(isMe || u.role !== "superadmin") && <ResetPasswordDialog user={u} />}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
