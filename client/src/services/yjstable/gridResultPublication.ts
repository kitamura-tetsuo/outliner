/**
 * Publish completed read evidence before resolving optional write authority.
 *
 * Grid rows and columns are already authoritative output of the completed
 * SELECT. Metadata and INSERT resolution are separate, potentially slower
 * capabilities and must not keep that read result hidden. Both publications
 * are fenced by the caller's currentness predicate.
 */
export async function publishGridResultBeforeAuthority<T>(options: {
    isCurrent: () => boolean;
    publishResult: () => void;
    resolveAuthority: () => Promise<T>;
    publishAuthority: (authority: T) => void;
}): Promise<void> {
    if (!options.isCurrent()) return;
    options.publishResult();
    const authority = await options.resolveAuthority();
    if (!options.isCurrent()) return;
    options.publishAuthority(authority);
}
