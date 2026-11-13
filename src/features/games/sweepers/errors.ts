// A Phase C játékosnak szóló szövegei (C.8). A szerver a saját `error` szövegét küldi, a kliens azt
// jeleníti meg; ez a másolat a helyben eldöntött üzenetekhez kell (pl. nem birtokolt eszköz, kifulladás).
export const SWEEPERS_ERRORS = {
  tooFar: 'Túl messze vagy ehhez.',
  notOwned: 'Ez az eszköz még nincs meg neked.',
  notEquipped: 'Nem ez az eszköz van a kezedben.',
  exhausted: 'Kifulladtál – pihenj egy kicsit!',
  tankFull: 'Tele a tartály.',
  packFull: 'Tele a hátizsák – borítsd ki (G).',
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
  unknownItem: 'Ismeretlen tárgy.'
} as const;
