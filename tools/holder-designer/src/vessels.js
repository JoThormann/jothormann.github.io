// The vessels a holder can be made for. All sizes in mm.
//
//   kind   which group the vessel is listed under in the picker
//
//   body   outer size where the holder grips it (diameter, or side of a square)
//   hole   opening that fits it with an FDM printer; taken from holders that
//          are in use where there is one, otherwise body + about 0.5 mm
//   top    widest part above the holder (cap, rim): neighbours must clear it
//   length overall height with the cap closed
//   pitch  usual centre-to-centre spacing in a rack
//   cone   length of the conical tip, 0 for a flat or round bottom
//
// Sizes are typical figures and differ a little between makers. The "Fit"
// control shifts the opening for a particular brand or printer.
export const VESSELS = {
  t15: { kind: 'tube', label: '1.5 ml tube', shape: 'round', body: 10.8, hole: 11.5, top: 13, length: 40, pitch: 20, cone: 18 },
  t20: { kind: 'tube', label: '2 ml tube', shape: 'round', body: 10.8, hole: 11.5, top: 13, length: 41, pitch: 20, cone: 6 },
  f15: { kind: 'tube', label: '15 ml tube', shape: 'round', body: 17, hole: 18, top: 21.5, length: 120, pitch: 25, cone: 22 },
  f50: { kind: 'tube', label: '50 ml tube', shape: 'round', body: 29, hole: 29.5, top: 34.5, length: 115, pitch: 45, cone: 15 },
  cuvette: { kind: 'cuvette', label: 'Cuvette, 12.5 mm square', shape: 'square', body: 12.5, hole: 13, top: 12.5, length: 45, pitch: 17, cone: 0 },
  pcr: { kind: 'tube', label: '0.2 ml PCR tube', shape: 'round', body: 6, hole: 6.4, top: 7.5, length: 21, pitch: 9, cone: 11 },
  t05: { kind: 'tube', label: '0.5 ml tube', shape: 'round', body: 7.8, hole: 8.3, top: 10, length: 30, pitch: 14, cone: 14 },
  t5: { kind: 'tube', label: '5 ml tube', shape: 'round', body: 17, hole: 17.8, top: 20, length: 60, pitch: 25, cone: 20 },
  cryo: { kind: 'vial', label: '2 ml cryovial', shape: 'round', body: 12.5, hole: 13, top: 13.5, length: 49, pitch: 17, cone: 0 },
  hplc: { kind: 'vial', label: '2 ml glass vial (12 × 32)', shape: 'round', body: 11.7, hole: 12.2, top: 11.7, length: 32, pitch: 16, cone: 0 },
  vial4: { kind: 'vial', label: '4 ml glass vial (15 × 45)', shape: 'round', body: 14.8, hole: 15.4, top: 14.8, length: 45, pitch: 20, cone: 0 },
  scint: { kind: 'vial', label: '20 ml scintillation vial', shape: 'round', body: 27.5, hole: 28.2, top: 27.5, length: 61, pitch: 33, cone: 0 },
  customRound: { kind: 'custom', label: 'Custom, round', shape: 'round', custom: true },
  customSquare: { kind: 'custom', label: 'Custom, square', shape: 'square', custom: true },
};


/** Picker groups, in the order they are listed. */
export const KINDS = [
  { id: 'tube', label: 'Tubes', order: ['pcr', 't05', 't15', 't20', 't5', 'f15', 'f50'] },
  { id: 'vial', label: 'Vials' },
  { id: 'cuvette', label: 'Cuvettes' },
  { id: 'custom', label: 'Your own size' },
];
