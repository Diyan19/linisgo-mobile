export interface OrientalMindoroMunicipalityRecord {
  id: string;
  name: string;
  classification: 'City' | 'Municipality';
  district: 1 | 2;
  centerLat: number;
  centerLng: number;
}

/**
 * Single authoritative Oriental Mindoro location catalog for the backend API (all 15 municipalities).
 * Coordinates represent approximate municipal hall / town-center reference points only.
 */
export const ORIENTAL_MINDORO_MUNICIPALITIES: readonly OrientalMindoroMunicipalityRecord[] = [
  { id: 'calapan-city', name: 'Calapan City', classification: 'City', district: 1, centerLat: 13.4115, centerLng: 121.1803 },
  { id: 'baco', name: 'Baco', classification: 'Municipality', district: 1, centerLat: 13.3592, centerLng: 121.0984 },
  { id: 'bansud', name: 'Bansud', classification: 'Municipality', district: 2, centerLat: 12.8636, centerLng: 121.4565 },
  { id: 'bongabong', name: 'Bongabong', classification: 'Municipality', district: 2, centerLat: 12.7469, centerLng: 121.4872 },
  { id: 'bulalacao', name: 'Bulalacao', classification: 'Municipality', district: 2, centerLat: 12.3268, centerLng: 121.3442 },
  { id: 'gloria', name: 'Gloria', classification: 'Municipality', district: 2, centerLat: 12.9774, centerLng: 121.4697 },
  { id: 'mansalay', name: 'Mansalay', classification: 'Municipality', district: 2, centerLat: 12.5204, centerLng: 121.4385 },
  { id: 'naujan', name: 'Naujan', classification: 'Municipality', district: 1, centerLat: 13.3236, centerLng: 121.3025 },
  { id: 'pinamalayan', name: 'Pinamalayan', classification: 'Municipality', district: 2, centerLat: 13.0357, centerLng: 121.4849 },
  { id: 'pola', name: 'Pola', classification: 'Municipality', district: 1, centerLat: 13.1444, centerLng: 121.4419 },
  { id: 'puerto-galera', name: 'Puerto Galera', classification: 'Municipality', district: 1, centerLat: 13.5022, centerLng: 120.9547 },
  { id: 'roxas', name: 'Roxas', classification: 'Municipality', district: 2, centerLat: 12.5855, centerLng: 121.5164 },
  { id: 'san-teodoro', name: 'San Teodoro', classification: 'Municipality', district: 1, centerLat: 13.4357, centerLng: 121.0205 },
  { id: 'socorro', name: 'Socorro', classification: 'Municipality', district: 1, centerLat: 13.0601, centerLng: 121.4098 },
  { id: 'victoria', name: 'Victoria', classification: 'Municipality', district: 1, centerLat: 13.1764, centerLng: 121.2828 },
];

const MUNICIPALITY_BY_ID = new Map<string, OrientalMindoroMunicipalityRecord>(
  ORIENTAL_MINDORO_MUNICIPALITIES.map(item => [item.id, item])
);

export function isValidOrientalMindoroMunicipalityId(id: unknown): id is string {
  return typeof id === 'string' && MUNICIPALITY_BY_ID.has(id.trim());
}

export function getOrientalMindoroMunicipalityById(
  id: string | null | undefined
): OrientalMindoroMunicipalityRecord | undefined {
  if (!id || typeof id !== 'string') return undefined;
  return MUNICIPALITY_BY_ID.get(id.trim());
}

/**
 * Deduplicates and validates an array of coverage area municipality IDs.
 * Returns both the deduplicated valid IDs and any unknown IDs rejected.
 */
export function validateAndDeduplicateCoverageAreas(rawIds: unknown): {
  validIds: string[];
  unknownIds: string[];
} {
  if (!Array.isArray(rawIds)) {
    return { validIds: [], unknownIds: [] };
  }

  const seenValid = new Set<string>();
  const unknownIds: string[] = [];

  for (const item of rawIds) {
    if (typeof item !== 'string' || !item.trim()) {
      unknownIds.push(String(item));
      continue;
    }
    const clean = item.trim();
    if (MUNICIPALITY_BY_ID.has(clean)) {
      seenValid.add(clean);
    } else {
      unknownIds.push(clean);
    }
  }

  return {
    validIds: Array.from(seenValid),
    unknownIds,
  };
}

/**
 * Deduplicates posts across multiple coverage areas by post ID (`Set<string>`).
 */
export function deduplicatePostsById<T extends { id: string }>(posts: readonly T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const post of posts) {
    if (!seen.has(post.id)) {
      seen.add(post.id);
      result.push(post);
    }
  }
  return result;
}
