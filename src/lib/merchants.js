// Known shops and services: names people type → the website the logo comes from.
// A transaction or recurring payment whose name matches shows that logo instead of its emoji.
// To add one: put the website first (whichever address gives the sharpest logo), then the names it may be written as (lowercase, no accents).
// A name starting with ^ is an everyday word too, so it only counts at the start ("Wise", not "Be wise").
const MERCHANTS = [
  // AI and software
  ['claude.ai', 'claude', 'anthropic'],
  ['chatgpt.com', 'chatgpt', 'openai', 'chat gpt'],
  ['gemini.google.com', 'gemini'],
  ['perplexity.ai', 'perplexity'],
  ['midjourney.com', 'midjourney'],
  ['cursor.com', '^cursor'],
  ['github.com', 'github'],
  ['notion.so', '^notion'],
  ['canva.com', 'canva'],
  ['adobe.com', 'adobe', 'photoshop', 'lightroom'],
  ['microsoft.com', 'microsoft', 'microsoft 365', 'office 365'],
  ['dropbox.com', 'dropbox'],
  ['1password.com', '1password'],
  ['duolingo.com', 'duolingo'],
  ['linkedin.com', 'linkedin'],
  ['zoom.us', '^zoom'],
  ['patreon.com', 'patreon'],
  ['substack.com', 'substack'],
  ['x.com', 'twitter', 'x premium'],
  ['nordvpn.com', 'nordvpn', 'nord vpn'],
  ['expressvpn.com', 'expressvpn', 'express vpn'],
  ['proton.me', 'proton'],
  ['figma.com', 'figma'],
  ['www.grammarly.com', 'grammarly'],
  ['www.todoist.com', 'todoist'],
  ['tinder.com', 'tinder'],
  ['bumble.com', 'bumble'],
  // Streaming, music, games
  ['netflix.com', 'netflix'],
  ['spotify.com', 'spotify'],
  ['disneyplus.com', 'disney+', 'disney plus', 'disney'],
  ['primevideo.com', '^prime video', 'amazon prime'],
  ['max.com', 'hbo max', 'hbo'],
  ['tv.apple.com', 'apple tv'],
  ['music.apple.com', 'apple music'],
  ['icloud.com', 'icloud'],
  ['youtube.com', 'youtube', 'youtube premium'],
  ['twitch.tv', 'twitch'],
  ['deezer.com', 'deezer'],
  ['audible.com', 'audible'],
  ['playstation.com', 'playstation', 'ps plus', 'psn'],
  ['xbox.com', 'xbox', 'game pass'],
  ['nintendo.com', 'nintendo'],
  ['steampowered.com', '^steam'],
  ['dazn.com', 'dazn'],
  ['sporttv.pt', 'sport tv'],
  ['cinemas.nos.pt', 'cinemas nos'],
  ['ucicinemas.pt', 'uci'],
  ['ticketline.pt', 'ticketline'],
  ['bol.pt', '^bol'],
  ['feverup.com', '^fever'],
  ['crunchyroll.com', 'crunchyroll'],
  ['paramountplus.com', 'paramount+', 'paramount plus', 'paramount'],
  ['skyshowtime.com', 'skyshowtime'],
  ['filmin.pt', 'filmin'],
  ['www.tidal.com', '^tidal'],
  ['storytel.com', 'storytel'],
  ['kindle.amazon.com', 'kindle'],
  ['chess.com', 'chess com', 'chess.com'],
  ['www.epicgames.com', 'epic games', 'fortnite'],
  ['roblox.com', 'roblox'],
  // Shopping
  ['apple.com', '^apple', 'app store'],
  ['amazon.com', 'amazon'],
  ['google.com', '^google', 'google one', 'google play'],
  ['ikea.com', 'ikea'],
  ['zara.com', 'zara'],
  ['hm.com', 'h&m', 'h m', 'hm'],
  ['primark.com', 'primark'],
  ['decathlon.pt', 'decathlon'],
  ['fnac.pt', 'fnac'],
  ['worten.pt', 'worten'],
  ['radiopopular.pt', 'radio popular'],
  ['leroymerlin.pt', 'leroy merlin'],
  ['aliexpress.com', 'aliexpress'],
  ['shein.com', 'shein'],
  ['temu.com', 'temu'],
  ['vinted.pt', 'vinted'],
  ['olx.pt', 'olx'],
  ['sephora.com', 'sephora'],
  ['wells.pt', '^wells'],
  ['flyingtiger.com', 'flying tiger'],
  ['paypal.com', 'paypal'],
  ['pullandbear.com', 'pull&bear', 'pull bear', 'pull and bear'],
  ['bershka.com', 'bershka'],
  ['massimodutti.com', 'massimo dutti'],
  ['mango.com', '^mango'],
  ['uniqlo.com', 'uniqlo'],
  ['www.lefties.com', 'lefties'],
  ['nike.com', 'nike'],
  ['www.adidas.pt', 'adidas'],
  ['www.sportzone.pt', 'sport zone', 'sportzone'],
  ['jdsports.com', 'jd sports'],
  ['kiabi.pt', 'kiabi'],
  ['zalando.pt', 'zalando'],
  ['www.etsy.com', 'etsy'],
  ['mediamarkt.es', 'mediamarkt', 'media markt'],
  ['www.primor.eu', 'primor'],
  ['douglas.pt', '^douglas'],
  ['kikocosmetics.com', 'kiko'],
  ['perfumesecompanhia.pt', 'perfumes companhia', 'perfumes & companhia'],
  ['bertrand.pt', '^bertrand'],
  ['wook.pt', 'wook'],
  ['aki.es', '^aki'],
  ['bricomarche.pt', 'bricomarche'],
  ['conforama.pt', 'conforama'],
  ['jysk.pt', 'jysk'],
  ['ctt.pt', 'ctt'],
  // Groceries
  ['continente.pt', 'continente', 'modelo continente'],
  ['pingodoce.pt', 'pingo doce'],
  ['lidl.pt', 'lidl'],
  ['aldi.pt', 'aldi'],
  ['auchan.pt', 'auchan', '^jumbo'],
  ['www.minipreco.pt', 'minipreco'],
  ['www.mercadona.pt', 'mercadona'],
  ['elcorteingles.es', 'el corte ingles', 'corte ingles'],
  ['e-leclerc.pt', 'leclerc', 'e leclerc'],
  ['www.spar-international.com', '^spar'],
  ['toogoodtogo.com', 'too good to go', 'toogoodtogo'],
  // Eating out and delivery
  ['glovoapp.com', 'glovo'],
  ['ubereats.com', 'uber eats', 'ubereats'],
  ['bolt.eu', 'bolt food'],
  ['mcdonalds.fr', 'mcdonalds', 'mcdonald s', 'mc donalds', 'mcdonald'],
  ['burgerking.pt', 'burger king'],
  ['kfc.pt', 'kfc'],
  ['starbucks.com', 'starbucks'],
  ['telepizza.com', 'telepizza'],
  ['dominos.pt', 'dominos', 'domino s'],
  ['pizzahut.pt', 'pizza hut'],
  ['h3.com', 'h3'],
  ['vitaminas.pt', 'vitaminas'],
  ['padariaportuguesa.pt', 'padaria portuguesa'],
  ['tacobell.com', 'taco bell'],
  ['fiveguys.com', 'five guys'],
  ['honestgreens.com', 'honest greens'],
  ['pansandcompany.com', 'pans company', 'pans & company'],
  ['www.dunkindonuts.com', 'dunkin'],
  ['costa.co.uk', 'costa coffee'],
  ['deltacafes.pt', 'delta cafes', 'delta q'],
  // Transport and travel
  ['uber.com', 'uber'],
  ['bolt.eu', 'bolt'],
  ['free-now.com', 'free now', 'freenow'],
  ['cp.pt', 'cp', 'comboios de portugal'],
  ['metrolisboa.pt', 'metro lisboa', 'metro de lisboa'],
  ['metrodoporto.pt', 'metro do porto'],
  ['carris.pt', 'carris'],
  ['navegante.pt', 'navegante'],
  ['flixbus.pt', 'flixbus'],
  ['ryanair.com', 'ryanair'],
  ['easyjet.com', 'easyjet'],
  ['flytap.com', 'tap', 'tap air portugal'],
  ['vueling.com', 'vueling'],
  ['booking.com', '^booking', 'booking com'],
  ['airbnb.com', 'airbnb'],
  ['galp.com', 'galp'],
  ['repsol.pt', 'repsol'],
  ['prio.pt', 'prio'],
  ['viaverde.pt', 'via verde'],
  ['cabify.com', 'cabify'],
  ['blablacar.pt', 'blablacar', 'bla bla car'],
  ['fertagus.pt', 'fertagus'],
  ['www.carrismetropolitana.pt', 'carris metropolitana'],
  ['rede-expressos.pt', 'rede expressos'],
  ['li.me', '^lime'],
  ['www.bp.com', 'bp'],
  ['shell.pt', '^shell'],
  ['moeveglobal.com', 'cepsa', 'moeve'],
  ['iberia.com', 'iberia'],
  ['www.wizzair.com', 'wizz air', 'wizzair'],
  ['transavia.com', 'transavia'],
  ['lufthansa.com', 'lufthansa'],
  ['airfrance.com', 'air france'],
  ['skyscanner.net', 'skyscanner'],
  ['www.expedia.com', 'expedia'],
  ['hostelworld.com', 'hostelworld'],
  // Bills and phone
  ['meo.pt', 'meo'],
  ['nos.pt', 'nos'],
  ['vodafone.pt', 'vodafone'],
  ['digi.pt', 'digi'],
  ['edp.pt', 'edp'],
  ['goldenergy.pt', 'goldenergy'],
  ['www.portaldasfinancas.gov.pt', 'financas', 'portal das financas', 'irs'],
  ['fidelidade.pt', 'fidelidade'],
  ['ageas.pt', 'ageas'],
  ['allianz.com', 'allianz'],
  ['revolut.com', 'revolut'],
  ['wise.com', '^wise'],
  ['nowo.pt', 'nowo'],
  ['www.seg-social.pt', 'seguranca social'],
  ['www.zurich.com.pt', '^zurich'],
  ['www.mbway.pt', 'mb way', 'mbway'],
  ['binance.com', 'binance'],
  ['coinbase.com', 'coinbase'],
  ['kraken.com', '^kraken'],
  ['trading212.com', 'trading 212', 'trading212'],
  ['xtb.com', 'xtb'],
  ['degiro.pt', 'degiro'],
  // Meal cards
  ['coverflex.com', 'coverflex'],
  ['edenred.pt', 'edenred'],
  ['pluxee.pt', 'pluxee'],
  // Health and fitness
  ['solinca.pt', 'solinca'],
  ['holmesplace.pt', 'holmes place'],
  ['goldsgym.com', 'golds gym', 'gold s gym'],
  ['lusiadas.pt', 'lusiadas'],
  ['multicare.pt', 'multicare'],
  ['medis.pt', '^medis'],
  ['strava.com', 'strava'],
  ['hospitaldaluz.pt', 'hospital da luz'],
  ['basic-fit.com', 'basic fit', 'basicfit'],
  ['virginactive.com', 'virgin active'],
  ['calm.com', '^calm'],
]

// Lowercase, no accents, punctuation turned into spaces: "McDonald's" → "mcdonald s"
function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9&+]+/g, ' ')
    .trim()
}

// Longest names first, so "uber eats" wins over "uber" and "bolt food" over "bolt"
const ALIASES = MERCHANTS.flatMap(([domain, ...names]) =>
  names.map((n) => ({ alias: normalize(n.replace(/^\^/, '')), domain, startOnly: n.startsWith('^') || n.length <= 4 })),
).sort(
  (a, b) => b.alias.length - a.alias.length,
)

const cache = new Map()

// The website whose logo fits this name, or null. Matches whole words, so "Claude Pro" → claude.ai,
// but "Bolton" is not Bolt. Short names (cp, nos, uber…) and everyday words only count at the start.
export function merchantDomain(name) {
  if (!name) return null
  if (cache.has(name)) return cache.get(name)
  const text = ` ${normalize(name)} `
  let found = null
  for (const { alias, domain, startOnly } of ALIASES) {
    const hit = startOnly ? text.startsWith(` ${alias} `) : text.includes(` ${alias} `)
    if (hit) {
      found = domain
      break
    }
  }
  cache.set(name, found)
  return found
}

// Logo picture for a website (Google's free website-icon service, no account needed)
export function logoUrl(domain) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`
}
