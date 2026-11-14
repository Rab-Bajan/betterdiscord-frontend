// A Phase C játékosnak szóló szövegei (C.8). A szerver a saját `error` szövegét küldi, a kliens azt
// jeleníti meg; ez a másolat a helyben eldöntött üzenetekhez kell (pl. nem birtokolt eszköz, kifulladás).
export const SWEEPERS_ERRORS = {
  tooFar: 'Túl messze vagy ehhez.',
  notOwned: 'Ez az eszköz még nincs meg neked.',
  notEquipped: 'Nem ez az eszköz van a kezedben.',
  exhausted: 'Kifulladtál – pihenj egy kicsit!',
  tankFull: 'Tele a tartály.',
  packFull: 'Tele a hátizsák – zsákold be (Q) vagy borítsd ki (G).',
  tooHeavy: 'Ez túl nehéz vagy túl nagy a hátizsákodnak.',
  noFuel: 'Kifogyott a benzin – tankolj a MÉH műhelyben.',
  clogged: 'Eldugult a cső – fújd ki (jobb klikk)!',
  lockedDistrict: 'Ez a kerület még le van zárva.',
  notEnoughCash: 'Nincs elég pénzed: {price} Ft kell.',
  notAtWorkbench: 'Ezt csak a MÉH műhelyben veheted meg.',
  notAtKiosk: 'Frissítőt a büfében vagy a MÉH irodában vehetsz.',
  alreadyOwned: 'Ez már megvan.',
  maxLevel: 'Ez már a legmagasabb szint.',
  staleLevel: 'Közben változott a szinted, próbáld újra.',
  noRepairNeeded: 'Ez az eszköz nem szorul javításra.',
  emptyPack: 'Üres a hátizsák.',
  unknownItem: 'Ismeretlen tárgy.',
  // Phase D (D.8)
  handsFull: 'Tele a kezed – előbb tedd le a zsákot.',
  notCarrying: 'Nincs a kezedben zsák.',
  noBags: 'Nincs ilyen zsákod – vegyél a MÉH műhelyben.',
  bagTooSmall: 'Ez nem fér bele ebbe a zsákba.',
  tooManyBags: 'Túl sok zsák van már ebben a világban.',
  bagStockFull: 'Ebből a zsákból nem fér több a raktáradba.',
  noBagNear: 'Nincs zsák a közelben.',
  bigBagCrane: 'A Big-Bag-et csak daruval lehet mozgatni.',
  outOfGrid: 'A városon kívül nem építhetsz.',
  reserved: 'Ez a terület foglalt (mérleg, garat vagy daru).',
  buildLimit: 'Elérted az építési korlátot: {what}.',
  blocked: 'Ide nem lehet építeni: valami útban van.',
  notFlat: 'Túl egyenetlen a talaj – rakj le előbb betonalapot.',
  supportsStructures: 'Előbb bontsd le, ami rajta áll.',
  unknownStructure: 'Ismeretlen épületelem.',
  notJammed: 'Ez a szalag nincs elakadva.',
  needBroom: 'Seprűvel kell megütni a vészgombot.',
  notAtCrane: 'A darut a vezérlőpultnál irányíthatod.',
  craneBusy: 'A daru éppen dolgozik.',
  craneTargetBusy: 'A célhely foglalt.',
  notInCraneArea: 'Ez a zsák nincs a daru hatókörében.',
  hopperFull: 'Tele a garat.',
  notAtTerminal: 'A logisztikai terminál a MÉH irodánál van.'
} as const;

export type SweepersErrorKey = keyof typeof SWEEPERS_ERRORS;

/** `{what}` of `buildLimit` (D.8). */
export const BUILD_LIMIT_WHAT = {
  structures: 'épületelem',
  foundations: 'betonalap',
  beltM: 'szalaghossz',
  junctions: 'elágazás/idom',
  hoppers: 'garat',
  packagers: 'zsákoló',
  fences: 'kerítés'
} as const;
