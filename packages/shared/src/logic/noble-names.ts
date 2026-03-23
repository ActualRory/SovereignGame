/**
 * Fantasy name generation for nobles.
 * Pure function — uses a seeded RNG for determinism.
 */

const FIRST_NAMES_MALE = [
  'Aldric', 'Baldric', 'Cedric', 'Dorian', 'Edmund', 'Fabian', 'Gareth',
  'Hadrian', 'Ivo', 'Julian', 'Konrad', 'Leopold', 'Magnus', 'Nolan',
  'Osric', 'Percival', 'Quentin', 'Roland', 'Sigmund', 'Theron',
  'Ulric', 'Valen', 'Wolfram', 'Alaric', 'Bastien', 'Caspian',
  'Desmond', 'Emeric', 'Florian', 'Godwin', 'Henrik', 'Isidore',
  'Jasper', 'Kael', 'Leander', 'Matthias', 'Nikolai', 'Orion',
  'Phelan', 'Rannulf', 'Severin', 'Torben', 'Uther', 'Viktor',
  'Wulfric', 'Alistair', 'Branwen', 'Corwin', 'Darius', 'Edric',
  'Fenris', 'Gideon', 'Hartwin', 'Ivar', 'Jareth', 'Kellan',
  'Lucian', 'Merrick', 'Norbert', 'Oberon', 'Pelias', 'Reynard',
  'Stellan', 'Tobias', 'Vaughn', 'Warrick', 'Yorick', 'Zephyr',
];

const FIRST_NAMES_FEMALE = [
  'Adela', 'Brenna', 'Cordelia', 'Dagny', 'Elara', 'Freya', 'Gwendolyn',
  'Helena', 'Isolde', 'Jocelyn', 'Katarina', 'Lysandra', 'Mirabel',
  'Nessa', 'Orla', 'Petra', 'Rosalind', 'Seraphina', 'Thea',
  'Ursula', 'Vivienne', 'Winifred', 'Yvaine', 'Astrid', 'Beatrix',
  'Cecily', 'Dorothea', 'Elowen', 'Fiora', 'Griselda', 'Hildegard',
  'Ingrid', 'Juliana', 'Keira', 'Liselotte', 'Maren', 'Nimue',
  'Octavia', 'Philippa', 'Rowena', 'Sigrid', 'Trista', 'Undine',
  'Valeria', 'Wilhelmina', 'Adelheid', 'Brunhilde', 'Clarissa',
  'Edith', 'Felicity', 'Genevieve', 'Honora', 'Imogen', 'Jessamine',
  'Lavinia', 'Mathilde', 'Nerissa', 'Odette', 'Primrose', 'Sabine',
  'Tatiana', 'Vesper', 'Winona', 'Yolanda', 'Zelda',
];

const SURNAMES = [
  'Ashford', 'Blackwood', 'Crestfall', 'Dunmore', 'Elderwood',
  'Fairfax', 'Greymane', 'Hightower', 'Ironside', 'Kestrel',
  'Langley', 'Montclair', 'Northcott', 'Oakheart', 'Penrose',
  'Ravencroft', 'Stonewall', 'Thornbury', 'Valmont', 'Whitmore',
  'Ashworth', 'Beaumont', 'Cromwell', 'Davenport', 'Everhart',
  'Foxley', 'Goldwyn', 'Harrowgate', 'Inglemore', 'Jarrow',
  'Kingsley', 'Lockwood', 'Mossbridge', 'Newbury', 'Oakridge',
  'Pemberton', 'Queensbury', 'Redfield', 'Sunderland', 'Thistlewood',
  'Underhill', 'Vexford', 'Warfield', 'Ashborne', 'Briarcliff',
  'Coldwell', 'Drayton', 'Elmsworth', 'Fernsby', 'Glenmore',
  'Halford', 'Ivywood', 'Kettlewell', 'Lindhurst', 'Merriweather',
  'Northbridge', 'Oldcastle', 'Pinehurst', 'Ravenscroft', 'Silverbrook',
];

/**
 * Generate a noble name using a seeded RNG function.
 * @param rng - A function returning a float in [0, 1).
 * @returns { firstName, surname }
 */
export function generateNobleName(rng: () => number): { firstName: string; surname: string } {
  // 50/50 male/female
  const isMale = rng() < 0.5;
  const firstNames = isMale ? FIRST_NAMES_MALE : FIRST_NAMES_FEMALE;
  const firstName = firstNames[Math.floor(rng() * firstNames.length)];
  const surname = SURNAMES[Math.floor(rng() * SURNAMES.length)];
  return { firstName, surname };
}

/**
 * Generate a starting age for a new noble.
 * @param rng - A function returning a float in [0, 1).
 * @param minAge - Minimum age (default 16).
 * @param maxAge - Maximum age (default 20).
 */
export function generateNobleAge(rng: () => number, minAge = 16, maxAge = 20): number {
  return minAge + Math.floor(rng() * (maxAge - minAge + 1));
}

/**
 * Generate a stat value (1-10) using a bell curve (sum of dice).
 * @param rng - A function returning a float in [0, 1).
 * @param diceCount - Number of dice to roll (default 2).
 * @param diceSides - Sides per die (default 5). 2d5 → range 2-10, mean 6.
 */
export function generateNobleStat(rng: () => number, diceCount = 2, diceSides = 5): number {
  let total = 0;
  for (let i = 0; i < diceCount; i++) {
    total += Math.floor(rng() * diceSides) + 1;
  }
  return Math.max(1, Math.min(10, total));
}
