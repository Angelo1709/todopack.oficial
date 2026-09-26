// Categorización automática por palabras clave para productos importados de la lista de precios.
//
// Este archivo lo importan también los scripts .mjs (Node ejecuta .ts quitando los tipos):
// no usar alias "@/", imports sin extensión ni sintaxis TS no borrable. Sin lookbehind en regex.
//
// Cómo se evalúa: el nombre se pasa a minúsculas sin acentos ni signos, y cada palabra clave
// tiene que coincidir con el COMIENZO de una palabra ("galletita" también toma "galletitas").
// Si la clave termina en "$" tiene que ser la palabra completa ("gin$" no toma "original").
// Las reglas se prueban en orden y gana la primera que coincide: el orden importa
// (ej. "LICOR ... DULCE DE LECHE" tiene que caer en licores antes que en lácteos).

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

const RULES: [string, string[]][] = [
  // Vasos, copas y accesorios de marcas de bebidas (no son bebidas).
  ["Otros", ["^copa$", "^vaso$(?!.*descart)", "^frapera", "^conservadora"]],
  // Excepciones que otra regla tomaría antes.
  ["Almacén", ["jugo de limon"]],
  ["Aguas", ["agua$", "aguas$", "soda$", "sifon", "villavicencio", "villa del sur", "eco de los andes", "villamanaos", "cellier"]],
  ["Cervezas", ["cerveza", "quilmes", "brahma", "stella$", "heineken", "corona$", "imperial$", "patagonia$", "schneider", "budweiser", "miller$", "iguana$", "santa fe$", "pilsen", "porron"]],
  ["Jugos e Isotónicas", ["jugo", "cepita", "baggio", "ades$", "levite", "aquarius", "powerade", "gatorade", "speed$", "monster", "red bull", "energizante", "isotonic", "clight", "tang$"]],
  [
    "Aperitivos y Licores",
    [
      "fernet", "gancia", "campari", "aperitivo", "aperol", "cynar", "amargo", "vermouth", "vermut", "cinzano",
      "carpano", "legui$", "cazalis", "cana$", "licor", "petaca", "baileys", "sheridans", "tia maria", "jagger",
      "jager", "whisky", "whiskey", "bourbon", "walker$", "chivas", "jameson", "ballantines", "old parr",
      "old smuggler", "white horse", "monkey shoulder", "jim beam", "jyb$", "vodka", "smirnof", "skyy",
      "gin$", "ginebra", "gordons", "beefeater", "bombay", "ron$", "branca", "1882", "cusenier", "bols$",
      "triestina",
    ],
  ],
  [
    "Vinos",
    [
      "vino", "malbec", "malb$", "caber", "cab$", "sauvignon", "sauv", "chardon", "chard$", "syrah", "bonarda",
      "torrontes", "merlot", "pinot", "petit verdot", "cabernet franc", "franc$", "franch$", "blend$", "blanc$",
      "tinto", "rosado", "rose$", "rosat$", "brut", "champagne", "champ$", "espumante", "demi sec", "chenin",
      "chennin", "cosecha tardia", "blanco dulce", "blanco seco", "toro$", "termidor", "uvita", "fond de cave",
      "botellon", "las perdices", "partridge", "rutini", "chandon", "mumm$", "codorniu", "norton$", "santa julia",
      "trapiche", "zuccardi", "portillo", "nampe", "estancia mdz", "balbo", "piel de lobo", "federico de alvear",
      "nieto senetiner", "callia", "cuesta del madero", "mosquita muerta", "dada$",
    ],
  ],
  [
    "Gaseosas",
    [
      "gaseosa", "7up", "seven up", "pepsi", "coca cola", "sprite", "fanta$", "mirinda", "paso de los toros",
      "manaos", "cunnington", "tacconi", "schweppes", "secco$", "tonica", "pomelo", "lima limon", "cola$",
    ],
  ],
  [
    "Snacks y Golosinas",
    [
      "papas", "palitos", "chizito", "snack", "mani$", "galletita", "gall$", "alfajor", "alf$", "chocolate",
      "caramelo", "chicle", "turron", "garrapinada", "doritos", "lays$", "9 de oro", "criollita", "bombon",
      "bon o bon", "rocklets", "mantecol", "budin", "pan dulce", "pepas", "palmerita", "gomita", "mogul",
      "conitos", "cascarones", "canoncitos", "bolitas", "pancetitas", "tutuca", "maiz inflado", "oblea",
      "cops$", "saladix", "chocolinas", "coquitas", "pitusas", "mana$", "sonrisas", "formis", "traviata",
      "tostex", "mediatarde", "don satur", "toconato", "horoscopo", "solitas", "bonafide", "fantoche",
      "georgalos", "lheritier", "vizzio", "grabich", "torroni", "misky", "cofler", "nevares", "arcor kiosco",
      "arcor seleccion", "almendras",
    ],
  ],
  [
    "Almacén",
    [
      "azucar", "yerba", "harina", "aceite", "aceituna", "arroz", "fideo", "spaghetti", "tallarin",
      "mostachol", "dedalito", "tirabuzon", "polenta", "prestopronta", "sal$", "celusal", "cafe$",
      "cappuccino", "nescafe", "te$", "mate cocido", "matecocido", "conserva", "arveja", "lenteja", "pure$",
      "tomate", "atun$", "mayonesa", "ketchup", "mostaza", "vinagre", "caldo", "knorr", "rocio vegetal",
      "jugo de limon", "flan$", "gelatina", "postre", "pan rallado",
    ],
  ],
  ["Lácteos", ["leche", "queso", "quesera", "yogur", "manteca", "dulce de leche", "ddl$", "crema$", "serenisima"]],
  [
    "Limpieza",
    [
      "lavandina", "ayudin", "detergente", "magistral", "jabon", "limpiador", "limp$", "desodorante ambiente",
      "deso amb", "glade", "poett", "procenex", "cif$", "blem$", "lysoform", "raid$", "insecticida", "esponja",
      "trapo", "pano$", "lana acero", "escoba", "papel higienico", "papel hig", "higienol", "rollo cocina",
      "rollo de cocina", "servilleta", "shampoo", "shamp$", "acond", "plusbelle", "sedal$", "granby",
    ],
  ],
  [
    "Descartables y Packaging",
    ["descartable", "vaso", "plato", "cubierto", "bandeja", "film$", "bolsa", "sorbete", "pote", "contenedor", "aluminio", "tenedor", "cuchara"],
  ],
]

// Cada clave se ancla al comienzo de una palabra; "$" final = palabra completa; "^" = comienzo del nombre.
function keywordSource(kw: string): string {
  let src = kw
  let prefix = "(?:^| )"
  if (src.startsWith("^")) {
    prefix = "^"
    src = src.slice(1)
  }
  src = src.replace(/\$/, "(?= |$)")
  return prefix + src
}

const COMPILED: [string, RegExp][] = RULES.map(([cat, kws]) => [cat, new RegExp(kws.map(keywordSource).join("|"))])

export function normalizeForCategory(desc: string): string {
  return String(desc ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export function categorize(desc: string): string {
  const d = normalizeForCategory(desc)
  for (const [cat, re] of COMPILED) {
    if (re.test(d)) return cat
  }
  return "Otros"
}

export function isCategory(value: string): boolean {
  return CATEGORY_ORDER.includes(value)
}
