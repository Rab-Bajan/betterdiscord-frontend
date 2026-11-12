// Journal catalog: the evidence kinds and the ghost archetypes (lore, evidence sets, hunt thresholds).

export interface EvidenceType {
  id: string;
  name: string;
  fullName: string;
  icon: string;
}

export interface GhostArchetype {
  id: string;
  name: string;
  title: string;
  evidence: readonly string[];
  /** A fake evidence the ghost always shows on top of its real ones (the Mimic's orbs). */
  deceptiveEvidence?: string;
  huntThreshold: number;
  lore: string;
  trait: string;
  strength: string;
  weakness: string;
}

export const EVIDENCE_TYPES: readonly EvidenceType[] = [
  { id: 'emf_5', name: 'EMF 5', fullName: 'EMF 5 (Kábelkereső / Feszültségmérő)', icon: '⚡' },
  { id: 'spirit_box', name: 'Spirit Box', fullName: 'Spirit Box (Bömbölő CB Rádió)', icon: '📻' },
  { id: 'fingerprints', name: 'UV Ujjlenyomat', fullName: 'UV Ujjlenyomat (Zöld kéz- és lábnyom)', icon: '🟣' },
  { id: 'ghost_orbs', name: 'Szellemgömb', fullName: 'Szellemgömb (Videókamera Gömbök)', icon: '⚪' },
  { id: 'ghost_writing', name: 'Szellemírás', fullName: 'Szellemírás (Kockás Nyomozó Füzet)', icon: '📝' },
  { id: 'freezing_temps', name: 'Fagypont Alatt', fullName: 'Fagypont Alatt (< 0.0°C hideg)', icon: '❄️' },
  { id: 'dots', name: 'D.O.T.S.', fullName: 'D.O.T.S. Projektor (Zöld Lézermező)', icon: '🟢' },
];

export const GHOST_ARCHETYPES: readonly GhostArchetype[] = [
  {
    id: 'lakatos_armando',
    name: 'Lakatos Ármándó',
    title: 'A Poltergeist',
    evidence: ['ghost_writing', 'spirit_box', 'emf_5'],
    huntThreshold: 50,
    lore: 'A miskolci MÉH telep legendás alakja, aki még halála után sem hajlandó lemondani a fémhulladékról és rézkábelekről. Amikor felbőszül, az egész hangárt képes telehajigálni rozsdás vascsövekkel.',
    trait: 'Multi-Throw Scrap Explosion: Képes 3–5 fémhulladékot egyszerre, hatalmas lendülettel (12 m/s) a nyomozók felé repíteni.',
    strength: 'Egyszerre több tárgyat mozgat és dobál el, extrém zajt és EMF 5 csúcsokat generálva.',
    weakness: 'Ha nincs a közvetlen közelében dobálható fémhulladék vagy alkatrész, tehetetlenné válik.',
  },
  {
    id: 'kolompar_kalman',
    name: 'Kolompár Kálmán',
    title: 'A Bicskás Vadász',
    evidence: ['freezing_temps', 'fingerprints', 'dots'],
    huntThreshold: 50,
    lore: 'Hidegvérű egykori éjjeliőr, aki rozsdás bicskájával járja az autóroncsok közti sötét sikátorokat. A fagypont alatti dermesztő hidegben nyeri vissza igazi erejét.',
    trait: 'Freezing Hunter: 0°C alatti hőmérsékletű helyiségekben mozgási sebessége 2.2 m/s-ról villámgyors 3.3 m/s-ra gyorsul.',
    strength: 'A fagyos helyeken elképesztő sebességgel vadászik és kíméletlenül üldözi a menekülőket.',
    weakness: 'Meleg helyeken és bekapcsolt világítás / fűtés mellett jelentősen lelassul.',
  },
  {
    id: 'rostas_bela',
    name: 'Rostás "Flexes" Béla',
    title: 'A Hangoskodó',
    evidence: ['emf_5', 'fingerprints', 'ghost_orbs'],
    huntThreshold: 50,
    lore: 'A miskolci éjszakák flexelő fantomja. Állandóan a rádiófrekvenciákon ordít ("A VASAT AKAROM!"), és a túlvilági hangjával hajlamos szétpattintani a villanykörtéket.',
    trait: 'Auditory Terror & Bulbs: Spirit Box kérdésekre sikoltva felel, és magas eséllyel pukkasztja szét a környező izzókat.',
    strength: 'Agresszív hangoskodása gyorsan kimeríti a nyomozók épelméjűségét, és sötétségbe borítja a szobát.',
    weakness: 'Hangos megnyilvánulásai miatt a kedvenc szobája és tartózkodási helye azonnal lelepleződik.',
  },
  {
    id: 'bunko_lajos',
    name: 'Bunkó Lajos',
    title: 'A Fagyos Rezes',
    evidence: ['freezing_temps', 'ghost_writing', 'spirit_box'],
    huntThreshold: 50,
    lore: 'A transzformátorházak és villanyórák egykori réztolvaja. Halála után is a villamos hálózatot babrálja, fagyos rézkristályokat hagyva a fémtárgyakon.',
    trait: 'Breaker Saboteur: 40% eséllyel lecsapja a fali biztosítéktáblát (áramtalanítva a teljes telepet).',
    strength: 'Sötétben sokkal magabiztosabban kezdeményez vadászatot, miután kiiktatta az áramot.',
    weakness: 'Ha a biztosíték fel van kapcsolva és az épület ki van világítva, alig mer manifesztálódni.',
  },
  {
    id: 'sarkozi_geza',
    name: 'Sárközi "Lókupec" Géza',
    title: 'A Csendes Árnyék',
    evidence: ['dots', 'ghost_orbs', 'freezing_temps'],
    huntThreshold: 50,
    lore: 'Ravasz és félénk telepi kupec, aki életében is a háttérből figyelt. Kerüli a csoportos nyomozókat, és csak akkor hajlandó jeleket hagyni, ha valaki egyedül marad.',
    trait: 'Extreme Shyness: Ha egynél több játékos tartózkodik a szobában, a paranormális aktivitása 80%-kal visszaesik.',
    strength: 'Csapatban szinte lehetetlen bizonyítékot szerezni tőle, csendben várja a préda elszakadását.',
    weakness: 'Egy magányos bátor nyomozó előtt gyorsan megmutatja az írást és a fagyos jeleket.',
  },
  {
    id: 'raffael_dzsenifer',
    name: 'Raffael Dzsenifer',
    title: 'A Démon',
    evidence: ['fingerprints', 'ghost_writing', 'freezing_temps'],
    huntThreshold: 70,
    lore: 'A Miskolci MÉH telep legveszedelmesebb és legkegyetlenebb entitása. Nem várja meg, hogy az épelme leessen: szinte azonnal tombolni és vadászni kezd.',
    trait: 'Early & Relentless Hunter: Már 70%-os átlagos épelméjűségnél vadászatot indít! A füstölő csak 60 másodpercig tartja távol.',
    strength: 'Rendkívül korai vadászatok, szinte minimális felkészülési időt adva a csapatnak.',
    weakness: 'A Mobile Jesus feszület jelenléte azonnal megakadályozza a támadásait, és időt nyer.',
  },
  {
    id: 'a_keresztapa',
    name: 'A Keresztapa',
    title: 'A Mimic (Utánzó)',
    evidence: ['spirit_box', 'fingerprints', 'freezing_temps'],
    deceptiveEvidence: 'ghost_orbs',
    huntThreshold: 50,
    lore: 'A miskolci alvilág egykori keresztapja, a megtévesztés és álcázás nagymestere. Képes bármelyik másik szellem viselkedését másolni, miközben félrevezeti a nyomozókat.',
    trait: 'The Great Deceiver: Más szellemek sebességét és tulajdonságait utánozza. Mindig hamis Szellemgömböt (4. bizonyíték) vetít a videókamerákra!',
    strength: 'A hamis bizonyíték és a változó viselkedés miatt rendkívül nehéz beazonosítani.',
    weakness: 'Négy egyidejű bizonyíték együttes észlelése egyértelműen lebuktatja a Mimic valódi természetét.',
  },
];
