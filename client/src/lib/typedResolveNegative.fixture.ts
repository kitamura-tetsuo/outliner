/**
 * Negative type cases for the typed internal-URL migration (issue #5629).
 *
 * This fixture is checked by `tsc --noEmit`, never executed: each
 * `@ts-expect-error` line must FAIL type checking today, and `tsc` itself
 * fails if any of them ever stops erroring. An invalid route ID or an
 * unknown/wrongly-typed parameter must be a compile error, so a mistyped
 * destination cannot silently ship.
 */
import { resolve } from "$app/paths";

export function typedResolveNegativeCases(): void {
    // @ts-expect-error unknown route ID
    resolve("/[project]/[nope]", { project: "acme" });

    // @ts-expect-error unknown parameter name
    resolve("/[project]/[page]", { project: "acme", wrong: "x" });

    // @ts-expect-error wrong parameter type
    resolve("/[project]/[page]", { project: 42, page: "x" });

    // @ts-expect-error missing parameters for a dynamic route
    resolve("/[project]/[page]");
}
