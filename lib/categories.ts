export const CATEGORY_SLUGS: Record<string, string> = {
  Gaseosas: "gaseosas",
  Aguas: "aguas",
  Cervezas: "cervezas",
  Vinos: "vinos",
  "Aperitivos y Licores": "aperitivos",
  "Jugos e Isotónicas": "jugos",
  "Snacks y Golosinas": "snacks",
  Almacén: "almacen",
  Lácteos: "lacteos",
  Limpieza: "limpieza",
  "Descartables y Packaging": "descartables",
  Otros: "otros",
}

export function categoryImage(category: string): string {
  const slug = CATEGORY_SLUGS[category] ?? "otros"
  return `/categories/${slug}.png`
}
