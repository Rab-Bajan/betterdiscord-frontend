// A besorolások megjelenítési adatai. A szín sosem az egyetlen jelölés: mindig van jel (symbol) és felirat is.
export const CLASSIFICATIONS = {
  brilliant: { label: 'Zseniális', symbol: '!!', color: '#1BACA6', help: 'Nehezen megtalálható, anyagáldozattal járó, mégis kiváló lépés.' },
  great: { label: 'Nagyszerű', symbol: '!', color: '#5C8BB0', help: 'Egyetlen jó lépés, amely a játszma fordulópontját jelenti.' },
  best: { label: 'Legjobb', symbol: '★', color: '#96BC4B', help: 'A Stockfish első számú javaslata.' },
  excellent: { label: 'Kiváló', symbol: '👍', color: '#96BC4B', help: 'Nagyon pontos lépés, alig kisebb értékű a legjobbnál.' },
  good: { label: 'Jó', symbol: '✓', color: '#8FA883', help: 'Szilárd lépés, elhanyagolható értékvesztéssel.' },
  book: { label: 'Elmélet', symbol: '📖', color: '#A88865', help: 'Ismert megnyitáselméleti lépés.' },
  inaccuracy: { label: 'Pontatlanság', symbol: '?!', color: '#E8B923', help: 'Kissé rontja az állást.' },
  mistake: { label: 'Hiba', symbol: '?', color: '#E58F2A', help: 'Érdemben rontja az állást.' },
  blunder: { label: 'Baklövés', symbol: '??', color: '#CA3431', help: 'Súlyos hiba, jelentősen megváltoztatja az értékelést.' },
  'missed-win': { label: 'Kihagyott nyerés', symbol: '✗', color: '#D4A017', help: 'Volt nyerő folytatás, de a lépés után már nem nyert az állás.' },
  'missed-mate': { label: 'Kihagyott matt', symbol: '#✗', color: '#B5338A', help: 'Volt kényszerített matt, de a lépés kihagyta.' }
};

// Megjelenítési sorrend az összegző táblában (jótól a rosszig)
export const CLASSIFICATION_ORDER = [
  'brilliant', 'great', 'best', 'excellent', 'good', 'book',
  'inaccuracy', 'mistake', 'blunder', 'missed-win', 'missed-mate'
];

export const classInfo = (id) => CLASSIFICATIONS[id] || CLASSIFICATIONS.good;
