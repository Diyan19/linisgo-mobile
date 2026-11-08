export interface OrientalMindoroLocation {
  id: string;
  name: string;
  classification: 'City' | 'Municipality';
  district: 1 | 2;
  centerLat: number;
  centerLng: number;
  sampleBarangays: string[];
}

/**
 * Single verified catalog of all 15 Oriental Mindoro cities and municipalities.
 * Coordinates represent approximate municipal hall / town center reference points
 * for area-level service discovery — never a user's personal home address.
 */
export const ORIENTAL_MINDORO_LOCATIONS: readonly OrientalMindoroLocation[] = [
  {
    id: 'calapan-city',
    name: 'Calapan City',
    classification: 'City',
    district: 1,
    centerLat: 13.4115,
    centerLng: 121.1803,
    sampleBarangays: ['Guinobatan', 'Ibaba East', 'Ilaya', 'Lalud', 'Lumangbayan', 'Pachoca', 'San Vicente Central', 'Santa Isabel', 'Sto. Niño', 'Tawiran'],
  },
  {
    id: 'baco',
    name: 'Baco',
    classification: 'Municipality',
    district: 1,
    centerLat: 13.3592,
    centerLng: 121.0984,
    sampleBarangays: ['Alag', 'Bangkatan', 'Burbuli', 'Catwiran I', 'Dulangan I', 'Malapad', 'Mangangan I', 'Mayabig', 'Poblacion', 'Santa Rosa I'],
  },
  {
    id: 'bansud',
    name: 'Bansud',
    classification: 'Municipality',
    district: 2,
    centerLat: 12.8636,
    centerLng: 121.4565,
    sampleBarangays: ['Alcadesma', 'Bato', 'Conrazon', 'Malo', 'Manihala', 'Pag-asa', 'Poblacion', 'Proper Bansud', 'Rosacara', 'Salcedo'],
  },
  {
    id: 'bongabong',
    name: 'Bongabong',
    classification: 'Municipality',
    district: 2,
    centerLat: 12.7469,
    centerLng: 121.4872,
    sampleBarangays: ['Anilao', 'Aplaya', 'Bagumbayan I', 'Batangan', 'Camantigue', 'Cawayan', 'Dayhagan', 'Labasan', 'Masaguisi', 'Poblacion'],
  },
  {
    id: 'bulalacao',
    name: 'Bulalacao',
    classification: 'Municipality',
    district: 2,
    centerLat: 12.3268,
    centerLng: 121.3442,
    sampleBarangays: ['Bagong Sikat', 'Balatasan', 'Benli', 'Cabugao', 'Cambunang', 'Campaasan', 'Maasin', 'Maujao', 'Milagrosa', 'Poblacion'],
  },
  {
    id: 'gloria',
    name: 'Gloria',
    classification: 'Municipality',
    district: 2,
    centerLat: 12.9774,
    centerLng: 121.4697,
    sampleBarangays: ['Agos', 'Agsalin', 'Alma Villa', 'Andres Bonifacio', 'Balete', 'Banus', 'Banutan', 'Bulaklakan', 'Maligaya', 'Santa Maria'],
  },
  {
    id: 'mansalay',
    name: 'Mansalay',
    classification: 'Municipality',
    district: 2,
    centerLat: 12.5204,
    centerLng: 121.4385,
    sampleBarangays: ['B. del Mundo', 'Balugo', 'Bonbon', 'Budburan', 'Cabalwa', 'Don Pedro', 'Maliwanag', 'Manaul', 'Panaytayan', 'Poblacion'],
  },
  {
    id: 'naujan',
    name: 'Naujan',
    classification: 'Municipality',
    district: 1,
    centerLat: 13.3236,
    centerLng: 121.3025,
    sampleBarangays: ['Adrialuna', 'Andres Ylagan', 'Antipolo', 'Apitong', 'Arangin', 'Aurora', 'Bacungan', 'Bagong Buhay', 'Bancuro', 'Poblacion I'],
  },
  {
    id: 'pinamalayan',
    name: 'Pinamalayan',
    classification: 'Municipality',
    district: 2,
    centerLat: 13.0357,
    centerLng: 121.4849,
    sampleBarangays: ['Anoling', 'Bacungan', 'Bangbang', 'Banilad', 'Buli', 'Cacawan', 'Del Razon', 'Marfrancisco', 'Wawa', 'Zone I (Poblacion)'],
  },
  {
    id: 'pola',
    name: 'Pola',
    classification: 'Municipality',
    district: 1,
    centerLat: 13.1444,
    centerLng: 121.4419,
    sampleBarangays: ['Bacauan', 'Bacungan', 'Batuhan', 'Bayanan', 'Biga', 'Buhay na Tubig', 'Calima', 'Calubasanhon', 'Casiligan', 'Zone I (Poblacion)'],
  },
  {
    id: 'puerto-galera',
    name: 'Puerto Galera',
    classification: 'Municipality',
    district: 1,
    centerLat: 13.5022,
    centerLng: 120.9547,
    sampleBarangays: ['Aninuan', 'Baclayan', 'Balatero', 'Dulangan', 'Palangan', 'Poblacion', 'Sabang', 'San Antonio', 'San Isidro', 'Sinandigan'],
  },
  {
    id: 'roxas',
    name: 'Roxas',
    classification: 'Municipality',
    district: 2,
    centerLat: 12.5855,
    centerLng: 121.5164,
    sampleBarangays: ['Bagumbayan (Poblacion)', 'Cantil', 'Dangay', 'Happy Valley', 'Libertad', 'Libtong', 'Mabuhay', 'Maraska', 'Odiong', 'Paclasan (Poblacion)'],
  },
  {
    id: 'san-teodoro',
    name: 'San Teodoro',
    classification: 'Municipality',
    district: 1,
    centerLat: 13.4357,
    centerLng: 121.0205,
    sampleBarangays: ['Bigaan', 'Caagutayan', 'Calangatan', 'Calsapa', 'Ilag', 'Lumangbayan', 'Poblacion', 'Tacligan'],
  },
  {
    id: 'socorro',
    name: 'Socorro',
    classification: 'Municipality',
    district: 1,
    centerLat: 13.0601,
    centerLng: 121.4098,
    sampleBarangays: ['Bagsok', 'Batong Dalig', 'Bayuin', 'Bugtong Na Tuog', 'Calocmoy', 'Catiningan', 'Happy Valley', 'Leuteboro I', 'Pasi I', 'Zone I (Poblacion)'],
  },
  {
    id: 'victoria',
    name: 'Victoria',
    classification: 'Municipality',
    district: 1,
    centerLat: 13.1764,
    centerLng: 121.2828,
    sampleBarangays: ['Alcate', 'Antonino', 'Babangonan', 'Bagong Buhay', 'Bagong Silang', 'Bambanin', 'Bethel', 'Canaan', 'Duongan', 'Poblacion I'],
  },
];

const LOCATION_MAP = new Map<string, OrientalMindoroLocation>(
  ORIENTAL_MINDORO_LOCATIONS.map(loc => [loc.id, loc])
);

export function getLocationById(id: string | null | undefined): OrientalMindoroLocation | undefined {
  if (!id) return undefined;
  return LOCATION_MAP.get(id);
}

export function isValidLocationId(id: string | null | undefined): boolean {
  if (!id) return false;
  return LOCATION_MAP.has(id);
}

export function getLocationName(id: string | null | undefined): string {
  if (!id) return 'Unspecified Location';
  return LOCATION_MAP.get(id)?.name || 'Unspecified Location';
}

export function getCoverageLocationNames(coverageAreaIds: string[] | null | undefined): string[] {
  if (!Array.isArray(coverageAreaIds) || coverageAreaIds.length === 0) {
    return [];
  }
  const seen = new Set<string>();
  const names: string[] = [];
  for (const id of coverageAreaIds) {
    const loc = LOCATION_MAP.get(id);
    if (loc && !seen.has(loc.id)) {
      seen.add(loc.id);
      names.push(loc.name);
    }
  }
  return names;
}

export function getPostAssociatedLocationIds(post: {
  type: 'request' | 'offer';
  targetLocationId?: string | null;
  coverageAreaIds?: string[];
}): string[] {
  if (post.type === 'request') {
    return post.targetLocationId && isValidLocationId(post.targetLocationId)
      ? [post.targetLocationId]
      : [];
  }
  if (!Array.isArray(post.coverageAreaIds)) return [];
  const uniqueIds = new Set<string>();
  for (const id of post.coverageAreaIds) {
    if (isValidLocationId(id)) {
      uniqueIds.add(id);
    }
  }
  return Array.from(uniqueIds);
}

export function getPostLocationSummary(post: {
  type: 'request' | 'offer';
  targetLocationId?: string | null;
  coverageAreaIds?: string[];
  optionalPublicAreaDescription?: string | null;
}): string {
  if (post.type === 'request') {
    const name = post.targetLocationId ? getLocationName(post.targetLocationId) : 'Location not specified';
    const extra = post.optionalPublicAreaDescription?.trim();
    return extra ? `${name} (${extra})` : name;
  }

  const names = getCoverageLocationNames(post.coverageAreaIds);
  if (names.length === 0) {
    return 'Coverage area not specified';
  }
  const base = names.join(', ');
  const extra = post.optionalPublicAreaDescription?.trim();
  return extra ? `${base} (${extra})` : base;
}

export function validatePostLocationForPublish(data: {
  type: 'request' | 'offer';
  targetLocationId?: string | null;
  coverageAreaIds?: string[];
}): { valid: boolean; error?: string } {
  if (data.type === 'request') {
    if (!data.targetLocationId || !isValidLocationId(data.targetLocationId)) {
      return {
        valid: false,
        error: 'Please select a valid city or municipality in Oriental Mindoro where cleaning assistance is needed.',
      };
    }
    return { valid: true };
  }

  const validCoverage = Array.isArray(data.coverageAreaIds)
    ? data.coverageAreaIds.filter(id => isValidLocationId(id))
    : [];
  if (validCoverage.length === 0) {
    return {
      valid: false,
      error: 'Please select at least one service coverage municipality or city in Oriental Mindoro before publishing.',
    };
  }
  return { valid: true };
}

export type LocationFilterMode = 'all' | 'requests-in' | 'offers-covering';

export function doesPostMatchLocationFilter(
  post: {
    type: 'request' | 'offer';
    targetLocationId?: string | null;
    coverageAreaIds?: string[];
  },
  selectedLocationId: string,
  locationMode: LocationFilterMode = 'all'
): boolean {
  if (!selectedLocationId || selectedLocationId === 'all') {
    if (locationMode === 'requests-in') return post.type === 'request';
    if (locationMode === 'offers-covering') return post.type === 'offer';
    return true;
  }

  if (locationMode === 'requests-in') {
    return post.type === 'request' && post.targetLocationId === selectedLocationId;
  }

  if (locationMode === 'offers-covering') {
    return (
      post.type === 'offer' &&
      Array.isArray(post.coverageAreaIds) &&
      post.coverageAreaIds.includes(selectedLocationId)
    );
  }

  // 'all' mode for a specific municipality: matches requests in that location OR offers covering that location
  if (post.type === 'request') {
    return post.targetLocationId === selectedLocationId;
  }
  return Array.isArray(post.coverageAreaIds) && post.coverageAreaIds.includes(selectedLocationId);
}
