import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Camera,
  Award,
  AlertTriangle,
  Send,
  X,
  Sparkles,
  Info
} from 'lucide-react';

export const EVIDENCE_TYPES = [
  { id: 'emf_5', name: 'EMF 5', fullName: 'EMF 5 (Kábelkereső / Feszültségmérő)', icon: '⚡' },
  { id: 'spirit_box', name: 'Spirit Box', fullName: 'Spirit Box (Bömbölő CB Rádió)', icon: '📻' },
  { id: 'fingerprints', name: 'UV Ujjlenyomat', fullName: 'UV Ujjlenyomat (Zöld kéz- és lábnyom)', icon: '🟣' },
  { id: 'ghost_orbs', name: 'Szellemgömb', fullName: 'Szellemgömb (Videókamera Gömbök)', icon: '⚪' },
  { id: 'ghost_writing', name: 'Szellemírás', fullName: 'Szellemírás (Kockás Nyomozó Füzet)', icon: '📝' },
  { id: 'freezing_temps', name: 'Fagypont Alatt', fullName: 'Fagypont Alatt (< 0.0°C hideg)', icon: '❄️' },
  { id: 'dots', name: 'D.O.T.S.', fullName: 'D.O.T.S. Projektor (Zöld Lézermező)', icon: '🟢' },
];

export const GHOST_ARCHETYPES = [
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

export default function JournalModal({
  isOpen,
  onClose,
  evidenceState = {},
  onToggleEvidence,
  photos = [],
  selectedGhost = '',
  onSelectGhost,
  onSubmitVerdict,
  matchResult = null,
  isAlive = true,
  sideTasks = [],
  onNewMatch = null // optional: 'Új küldetés' callback after a result
}) {
  const [activeTab, setActiveTab] = useState('evidence'); // 'evidence' | 'database' | 'photos' | 'verdict'
  const [selectedDbGhost, setSelectedDbGhost] = useState(GHOST_ARCHETYPES[0].id);

  // When the server returns the verdict, jump to the result screen
  useEffect(() => {
    if (matchResult) setActiveTab('verdict');
  }, [matchResult]);

  if (!isOpen) return null;

  // 3-State toggle helper: 0 -> 1 -> 2 -> 0
  const handleEvidenceClick = (evId) => {
    const current = evidenceState[evId] || 0;
    const next = (current + 1) % 3;
    if (onToggleEvidence) {
      onToggleEvidence(evId, next);
    }
  };

  // Dynamic ghost exclusion calculation
  const markedFound = Object.entries(evidenceState)
    .filter(([_, state]) => state === 1)
    .map(([id]) => id);

  const markedExcluded = Object.entries(evidenceState)
    .filter(([_, state]) => state === 2)
    .map(([id]) => id);

  const isGhostPossible = (ghost) => {
    // Special rule for A Keresztapa: has fake ghost_orbs
    const ghostEvidenceSet = new Set(ghost.evidence);
    if (ghost.id === 'a_keresztapa') {
      ghostEvidenceSet.add('ghost_orbs');
    }

    // Must contain all 'Found' evidence
    for (const found of markedFound) {
      if (!ghostEvidenceSet.has(found)) {
        return false;
      }
    }

    // Must NOT contain any 'Excluded' evidence
    // (Special case: A Keresztapa is not excluded by Szellemgömb ruling out, because true evidence doesn't require it)
    for (const excluded of markedExcluded) {
      if (ghost.id === 'a_keresztapa' && excluded === 'ghost_orbs') {
        continue;
      }
      if (ghost.evidence.includes(excluded)) {
        return false;
      }
    }

    return true;
  };

  const possibleGhostsCount = GHOST_ARCHETYPES.filter(isGhostPossible).length;

  // Photo calculation
  const totalPhotoReward = photos.reduce((sum, p) => sum + (p.reward || 0), 0);
  const cappedPhotoReward = Math.min(3000, totalPhotoReward);

  // Side task calculation
  // Mirrors the server payout: 2500 Ft + max(1, completed side tasks) * 500 Ft (correct verdict only)
  const doneSideTasks = (sideTasks || []).filter(t => t.completed).length;
  const sideTasksReward = Math.max(1, doneSideTasks) * 500;
  const primaryReward = 2500;
  const finalPayout = primaryReward + sideTasksReward;
  const resultGhost = matchResult ? (matchResult.actualGhost || matchResult.ghostType) : '';
  const resultPayout = matchResult ? (matchResult.payoutFt ?? matchResult.rewardFt ?? 0) : 0;

  const dbGhost = GHOST_ARCHETYPES.find(g => g.id === selectedDbGhost) || GHOST_ARCHETYPES[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md select-none font-sans"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Journal Book Container */}
      <div
        className="w-full max-w-4xl h-[92vh] max-h-[750px] rounded-2xl flex flex-col overflow-hidden shadow-2xl relative"
        style={{
          background: 'linear-gradient(145deg, #181926, #0e101a)',
          border: '2px solid rgba(125, 105, 255, 0.3)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
        }}
      >
        {/* Top Header Bar */}
        <div
          className="h-16 px-4 sm:px-6 flex items-center justify-between flex-shrink-0"
          style={{
            background: 'linear-gradient(90deg, #101329, #1b1e38)',
            borderBottom: '1px solid rgba(125, 105, 255, 0.15)'
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-xl shadow">
              📖
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black tracking-wide text-gray-100 flex items-center gap-2">
                MISKOLC-PHOBIA NYOMOZÓI JEGYZŐKÖNYV
              </h2>
              <p className="text-xs text-purple-300/70 font-mono">A MÉH Telep Paranormális Dokumentációja</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition flex items-center gap-1.5 text-xs font-semibold"
            title="Jegyzőkönyv becsukása [J]"
          >
            <span>Bezárás</span>
            <kbd className="px-1.5 py-0.5 rounded bg-black/40 border border-gray-600 text-[10px]">J</kbd>
            <X className="w-5 h-5 ml-1" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          className="flex items-center px-4 sm:px-6 gap-2 border-b overflow-x-auto scrollbar-none flex-shrink-0"
          style={{ background: '#121425', borderColor: 'rgba(125, 105, 255, 0.1)' }}
        >
          <button
            onClick={() => setActiveTab('evidence')}
            className={`px-4 py-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'evidence'
                ? 'border-purple-500 text-purple-300 bg-purple-500/10'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 text-purple-400" />
            <span>Bizonyítékok</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-900/50 text-purple-300 font-mono">
              {possibleGhostsCount} / 7 lehetséges
            </span>
          </button>

          <button
            onClick={() => setActiveTab('database')}
            className={`px-4 py-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'database'
                ? 'border-purple-500 text-purple-300 bg-purple-500/10'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <BookOpen className="w-4 h-4 text-indigo-400" />
            <span>Szellem Adatbázis</span>
          </button>

          <button
            onClick={() => setActiveTab('photos')}
            className={`px-4 py-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'photos'
                ? 'border-purple-500 text-purple-300 bg-purple-500/10'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Camera className="w-4 h-4 text-pink-400" />
            <span>Fotóalbum</span>
            {photos.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-pink-900/50 text-pink-300 font-mono">
                {photos.length}/10
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('verdict')}
            className={`px-4 py-3 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
              activeTab === 'verdict'
                ? 'border-emerald-500 text-emerald-300 bg-emerald-500/10'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Award className="w-4 h-4 text-emerald-400" />
            <span>Végső Döntés</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 text-gray-300">
          {/* TAB 1: EVIDENCE CHECKLIST */}
          {activeTab === 'evidence' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
              {/* Left Column: 7 Evidences */}
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-gray-700/50">
                  <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    7 Bizonyíték Típus
                  </h3>
                  <span className="text-[11px] text-gray-400 font-mono">
                    Kattints a váltáshoz: [✓] / [✗] / [–]
                  </span>
                </div>

                <div className="space-y-2">
                  {EVIDENCE_TYPES.map((ev) => {
                    const state = evidenceState[ev.id] || 0; // 0: None, 1: Found, 2: Ruled Out
                    return (
                      <div
                        key={ev.id}
                        onClick={() => handleEvidenceClick(ev.id)}
                        className={`p-3 rounded-xl cursor-pointer flex items-center justify-between transition-all border ${
                          state === 1
                            ? 'bg-emerald-950/40 border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                            : state === 2
                            ? 'bg-red-950/30 border-red-500/50 opacity-60 line-through'
                            : 'bg-[#151728] border-gray-700/60 hover:border-purple-500/40 hover:bg-[#1a1d33]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{ev.icon}</span>
                          <div>
                            <div className="font-semibold text-sm text-gray-200">{ev.name}</div>
                            <div className="text-[11px] text-gray-400">{ev.fullName}</div>
                          </div>
                        </div>

                        {/* State indicator button */}
                        <div className="flex items-center gap-1.5">
                          {state === 1 && (
                            <span className="flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-900/60 px-2 py-1 rounded-lg border border-emerald-500/50">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              MEGTALÁLVA
                            </span>
                          )}
                          {state === 2 && (
                            <span className="flex items-center gap-1 text-xs font-bold text-red-400 bg-red-900/60 px-2 py-1 rounded-lg border border-red-500/50">
                              <XCircle className="w-3.5 h-3.5" />
                              KIZÁRVA
                            </span>
                          )}
                          {state === 0 && (
                            <span className="flex items-center gap-1 text-xs font-medium text-gray-400 bg-gray-800/60 px-2 py-1 rounded-lg border border-gray-700">
                              <HelpCircle className="w-3.5 h-3.5" />
                              NEM VIZSGÁLT
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-800/30 text-xs text-purple-300/80 flex items-start gap-2">
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-purple-400" />
                  <span>
                    <strong>Tipp:</strong> A kizárt bizonyítékok automatikusan áthúzzák a kizárt szellemtípusokat a jobb oldali listában.
                  </span>
                </div>
              </div>

              {/* Right Column: 7 Ghost Archetypes Filter */}
              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-gray-700/50">
                  <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider">
                    Miskolci Szellemek ({possibleGhostsCount} / 7)
                  </h3>
                  <span className="text-[11px] text-gray-400 font-mono">Dinamikus Kizárás</span>
                </div>

                <div className="space-y-2">
                  {GHOST_ARCHETYPES.map((ghost) => {
                    const possible = isGhostPossible(ghost);
                    return (
                      <div
                        key={ghost.id}
                        className={`p-3 rounded-xl border transition-all ${
                          possible
                            ? 'bg-[#151728] border-purple-500/40 shadow-sm'
                            : 'bg-[#0f111d] border-gray-800/50 opacity-40 grayscale line-through'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-gray-100">{ghost.name}</span>
                            <span className="text-xs text-purple-400 font-medium">({ghost.title})</span>
                          </div>
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-black/40 text-gray-400">
                            Küszöb: {ghost.huntThreshold}%
                          </span>
                        </div>

                        {/* Evidence badges */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {ghost.evidence.map((evId) => {
                            const evObj = EVIDENCE_TYPES.find((e) => e.id === evId);
                            const state = evidenceState[evId] || 0;
                            return (
                              <span
                                key={evId}
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                                  state === 1
                                    ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-500/40'
                                    : state === 2
                                    ? 'bg-red-950/40 text-red-400 line-through'
                                    : 'bg-black/30 text-gray-300 border border-gray-700/50'
                                }`}
                              >
                                {evObj?.icon} {evObj?.name}
                              </span>
                            );
                          })}

                          {ghost.deceptiveEvidence && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-950/40 text-amber-300 border border-amber-600/40 flex items-center gap-1" title="Megtévesztő 4. bizonyíték">
                              ⚪ Hamis Gömb (4.)
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GHOST DATABASE / ENCYCLOPEDIA */}
          {activeTab === 'database' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
              {/* Left Selector List */}
              <div className="space-y-2 border-r border-gray-700/40 pr-0 md:pr-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
                  Szellemek Enciklopédiája
                </h3>
                {GHOST_ARCHETYPES.map((g) => {
                  const isSelected = g.id === selectedDbGhost;
                  return (
                    <button
                      key={g.id}
                      onClick={() => setSelectedDbGhost(g.id)}
                      className={`w-full text-left p-3 rounded-xl transition-all border flex items-center justify-between ${
                        isSelected
                          ? 'bg-purple-900/30 border-purple-500 text-white shadow-md'
                          : 'bg-[#151728] border-gray-800 text-gray-300 hover:border-gray-700 hover:text-white'
                      }`}
                    >
                      <div>
                        <div className="font-bold text-sm">{g.name}</div>
                        <div className="text-xs text-purple-400/80">{g.title}</div>
                      </div>
                      <span className="text-xs text-gray-500">→</span>
                    </button>
                  );
                })}
              </div>

              {/* Right Detail Pane */}
              <div className="md:col-span-2 space-y-4">
                <div className="p-4 rounded-xl bg-[#151728] border border-purple-500/30">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xl font-black text-gray-100">{dbGhost.name}</h2>
                      <p className="text-sm text-purple-400 font-semibold">{dbGhost.title}</p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-950 border border-purple-500/50 text-purple-200">
                      Vadászat: &lt;{dbGhost.huntThreshold}% Épelme
                    </span>
                  </div>

                  <div className="mt-4 text-sm text-gray-300 leading-relaxed bg-black/20 p-3 rounded-lg border border-gray-800">
                    <strong className="text-gray-200">Háttértörténet:</strong> {dbGhost.lore}
                  </div>

                  {/* Trait & Behavior */}
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-red-950/20 border border-red-800/40">
                      <div className="font-bold text-red-300 flex items-center gap-1.5 mb-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Erősség & Viselkedés
                      </div>
                      <p className="text-gray-300">{dbGhost.strength}</p>
                    </div>

                    <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/40">
                      <div className="font-bold text-emerald-300 flex items-center gap-1.5 mb-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Gyengeség
                      </div>
                      <p className="text-gray-300">{dbGhost.weakness}</p>
                    </div>
                  </div>

                  {/* Special Trait Box */}
                  <div className="mt-3 p-3 rounded-lg bg-indigo-950/30 border border-indigo-700/40 text-xs">
                    <strong className="text-indigo-300">Egyedi Tulajdonság:</strong> {dbGhost.trait}
                  </div>

                  {/* Required Evidence Badges */}
                  <div className="mt-4">
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                      Szükséges Bizonyítékok:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {dbGhost.evidence.map((evId) => {
                        const ev = EVIDENCE_TYPES.find((e) => e.id === evId);
                        return (
                          <span
                            key={evId}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-900/40 border border-purple-500/50 text-purple-200 flex items-center gap-1.5"
                          >
                            <span>{ev?.icon}</span>
                            <span>{ev?.fullName}</span>
                          </span>
                        );
                      })}
                      {dbGhost.deceptiveEvidence && (
                        <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-900/40 border border-amber-500/50 text-amber-200 flex items-center gap-1.5">
                          <span>⚪</span>
                          <span>Deceptív Szellemgömb (Hamis 4. nyom)</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PHOTO ALBUM */}
          {activeTab === 'photos' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-gray-700/50">
                <div>
                  <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider flex items-center gap-2">
                    <Camera className="w-4 h-4 text-pink-400" />
                    Fotóalbum (10 Fényképhely)
                  </h3>
                  <p className="text-xs text-gray-400">
                    A Fényképezőgéppel lőtt bizonyítékok és vérdíjak
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">Fotó Jutalom Összesen:</div>
                  <div className="text-base font-black text-amber-400">+{cappedPhotoReward} Ft</div>
                </div>
              </div>

              {/* 10 Photo Slots Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {Array.from({ length: 10 }).map((_, idx) => {
                  const photo = photos[idx];
                  if (!photo) {
                    return (
                      <div
                        key={idx}
                        className="aspect-[3/4] rounded-xl border-2 border-dashed border-gray-700/60 bg-black/20 flex flex-col items-center justify-center p-3 text-center text-gray-600"
                      >
                        <Camera className="w-6 h-6 mb-1 opacity-40" />
                        <span className="text-[11px] font-mono font-medium">#{idx + 1} Üres</span>
                        <span className="text-[9px] text-gray-500 mt-1">Kattints a géppel [LMB]</span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={photo.id || idx}
                      className="aspect-[3/4] rounded-xl border border-purple-500/40 bg-[#16182a] flex flex-col overflow-hidden shadow-lg"
                    >
                      {/* Photo Image preview */}
                      <div className="flex-1 bg-black/60 relative overflow-hidden flex items-center justify-center">
                        {photo.dataUrl ? (
                          <img
                            src={photo.dataUrl}
                            alt={photo.subject}
                            className="w-full h-full object-cover filter contrast-125"
                          />
                        ) : (
                          <div className="text-center p-2">
                            <span className="text-2xl">📸</span>
                            <div className="text-[10px] text-gray-400 mt-1 font-mono">
                              {photo.subject || 'Bizonyíték'}
                            </div>
                          </div>
                        )}

                        {/* Stars Overlay */}
                        <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-black/80 text-[10px] text-amber-300 font-bold flex items-center gap-0.5">
                          {Array.from({ length: photo.stars || 1 }).map((_, s) => (
                            <span key={s}>★</span>
                          ))}
                        </div>
                      </div>

                      {/* Photo Footer */}
                      <div className="p-2 bg-[#121324] border-t border-gray-800 text-xs">
                        <div className="font-bold text-gray-200 truncate">{photo.subject}</div>
                        <div className="flex items-center justify-between text-[11px] mt-0.5">
                          <span className="text-gray-400">{photo.stars || 1} Csillag</span>
                          <span className="font-bold text-emerald-400">+{photo.reward || 300} Ft</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: FINAL VERDICT */}
          {activeTab === 'verdict' && (
            <div className="max-w-2xl mx-auto flex flex-col gap-6 py-2">
              <div className="text-center space-y-2">
                <div className="w-14 h-14 rounded-2xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-3xl mx-auto shadow-lg">
                  ⚖️
                </div>
                <h3 className="text-xl font-black text-gray-100">Végső Szellem Azonosítás és Elszámolás</h3>
                <p className="text-xs sm:text-sm text-gray-400">
                  Válasszátok ki a hivatalos jegyzőkönyvbe kerülő szellemet, majd zárjátok le a küldetést!
                </p>
              </div>

              {/* Ghost Selection Dropdown */}
              <div className="p-4 rounded-xl bg-[#151728] border border-purple-500/30 space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-purple-300">
                  Szerintünk a kísértő szellem:
                </label>

                <select
                  value={selectedGhost}
                  onChange={(e) => onSelectGhost && onSelectGhost(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-[#0e101a] border border-purple-500/50 text-white font-bold text-sm focus:outline-none focus:border-purple-400 shadow-inner"
                >
                  <option value="">-- Válasszatok egy szellemet --</option>
                  {GHOST_ARCHETYPES.map((g) => (
                    <option key={g.id} value={g.name}>
                      {g.name} ({g.title})
                    </option>
                  ))}
                </select>

                {selectedGhost && (
                  <div className="text-xs text-purple-300/80 bg-purple-950/30 p-2.5 rounded-lg border border-purple-800/40">
                    Kijelölve: <strong>{selectedGhost}</strong>. A lezárás után a Tranzit teherautó ajtaja kinyílik, és a szerver kiértékeli a meccset.
                  </div>
                )}
              </div>

              {/* Financial Payout Breakdown */}
              <div className="p-4 rounded-xl bg-[#151728] border border-gray-700/60 space-y-2.5 text-xs sm:text-sm">
                <div className="font-bold text-gray-300 uppercase tracking-wider text-xs pb-1 border-b border-gray-700">
                  Várható Kifizetési Bontás
                </div>

                <div className="flex justify-between items-center text-gray-300">
                  <span>Helyes Szellem Azonosítás (Fő cél):</span>
                  <span className="font-mono font-bold text-emerald-400">+2 500 Ft</span>
                </div>

                <div className="flex justify-between items-center text-gray-300">
                  <span>Mellékküldetések ({doneSideTasks} teljesítve, min. 1 számít):</span>
                  <span className="font-mono font-bold text-emerald-400">+{sideTasksReward} Ft</span>
                </div>

                <div className="flex justify-between items-center text-gray-300">
                  <span>Fotóalbum ({photos.length} kép, tájékoztató):</span>
                  <span className="font-mono font-bold text-gray-500">{cappedPhotoReward} Ft</span>
                </div>

                <div className="flex justify-between items-center text-gray-300 pt-2 border-t border-gray-800">
                  <span>Túlélési Státusz:</span>
                  <span className={`font-bold ${isAlive ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {isAlive ? 'Életben' : 'Elhunyt nyomozó'}
                  </span>
                </div>

                <div className="flex justify-between items-center text-base sm:text-lg font-black text-gray-100 pt-2 border-t border-gray-700">
                  <span>Becsült Kifizetés:</span>
                  <span className="font-mono text-emerald-400">+{finalPayout} Ft</span>
                </div>
              </div>

              {/* Match Result Display if finished */}
              {matchResult && (
                <div className={`order-first p-4 rounded-xl border text-center ${
                  matchResult.correct ? 'bg-emerald-950/40 border-emerald-500 text-emerald-200' : 'bg-red-950/40 border-red-500 text-red-200'
                }`}>
                  <div className="text-xl font-black mb-1">
                    {matchResult.correct ? '🎉 SIKERES NYOMOZÁS!' : '❌ HIBÁS TIPP!'}
                  </div>
                  <div className="text-sm">
                    A valódi szellem: <strong>{resultGhost}</strong>
                  </div>
                  <div className="text-base font-bold mt-2">
                    Jóváírt jutalom: +{resultPayout} Ft
                  </div>
                  {onNewMatch && (
                    <button
                      onClick={onNewMatch}
                      className="mt-3 px-5 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-sm font-bold cursor-pointer"
                    >
                      Új küldetés
                    </button>
                  )}
                </div>
              )}

              {/* Submit Button */}
              {!matchResult && (
                <button
                  disabled={!selectedGhost}
                  onClick={() => onSubmitVerdict && onSubmitVerdict(selectedGhost)}
                  className={`w-full py-4 rounded-xl font-black text-sm tracking-wide uppercase transition-all shadow-xl flex items-center justify-center gap-2 ${
                    selectedGhost
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white cursor-pointer hover:shadow-emerald-500/30'
                      : 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  <span>Jegyzőkönyv Lezárása és Elküldése</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
