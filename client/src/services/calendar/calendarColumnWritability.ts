import { analyzeDirectSelectProjection } from "$shared/services/directSelectProjection";

/**
 * Resolve Calendar result names to unchanged source fields. Mutation authority
 * remains with the existing row provider; an empty map is explicitly
 * read-only. PostgreSQL parsing preserves quoted identifiers and makes lexical
 * noise irrelevant to this classification.
 */
export function analyzeCalendarColumnWritability(query: string): Map<string, string> {
    return analyzeDirectSelectProjection(query);
}
