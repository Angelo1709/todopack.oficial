// Keyword-based categorization for imported products.
const RULES: [string, string[]][] = [
  ["Gaseosas", ["gaseosa", "7up", "pepsi", "coca", "sprite", "fanta", "mirinda", "paso de los toros", "manaos", "cunnington", "seven", "tonica", "pomelo", "lima limon", "cola"]],
  ["Aguas", ["agua", "soda", "villavicencio", "villa del sur", "eco de los andes", "sifon"]],
  ["Cervezas", ["cerveza", "quilmes", "brahma", "stella", "heineken", "andes", "corona", "imperial", "patagonia", "schneider", "budweiser", "miller", "porron", "lata cerv"]],
  ["Vinos", ["vino", "tinto", "malbec", "cabernet", "chardonnay", "rose", "espumante", "champ", "termidor", "fond de cave", "dada"]],
  ["Aperitivos y Licores", ["fernet", "gancia", "campari", "aperitivo", "whisky", "vodka", "gin", "ron", "aperol", "cynar", "licor", "vermouth", "branca", "1882", "smirnoff", "skyy"]],
  ["Jugos e Isotónicas", ["jugo", "cepita", "baggio", "ades", "citric", "levite", "aquarius", "powerade", "gatorade", "speed", "monster", "red bull", "energizante", "isot"]],
  ["Snacks y Golosinas", ["papas", "palitos", "chizitos", "snack", "mani", "galletita", "alfajor", "chocolate", "caramelo", "chicle", "turron", "doritos", "lays", "9 de oro", "criollita"]],
  ["Almacén", ["azucar", "yerba", "harina", "aceite", "arroz", "fideo", "polenta", "sal", "cafe", "mate cocido", "conserva", "arveja", "lenteja", "pure", "mayonesa", "ketchup", "mostaza", "vinagre", "caldo"]],
  ["Lácteos", ["leche", "queso", "yogur", "manteca", "dulce de leche", "crema"]],
  ["Limpieza", ["lavandina", "detergente", "jabon", "limpiador", "desodorante ambiente", "cif", "ayudin", "esponja", "trapo", "escoba", "papel higienico", "rollo cocina", "servilleta"]],
  ["Descartables y Packaging", ["descartable", "vaso", "plato", "cubierto", "bandeja", "film", "bolsa", "sorbete", "pote", "contenedor", "aluminio", "tenedor", "cuchara", "pack "]],
]

export function categorize(desc: string): string {
  const d = desc.toLowerCase()
  for (const [cat, kws] of RULES) {
    for (const kw of kws) {
      if (d.includes(kw)) return cat
    }
  }
  return "Otros"
}

export const CATEGORY_ORDER = [
  "Gaseosas",
  "Aguas",
  "Cervezas",
  "Vinos",
  "Aperitivos y Licores",
  "Jugos e Isotónicas",
  "Snacks y Golosinas",
  "Almacén",
  "Lácteos",
  "Limpieza",
  "Descartables y Packaging",
  "Otros",
]
