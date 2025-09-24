const BANNED_METHODS = new Set(["skip", "only", "todo", "fixme"]);
const DIRECT_BASES = new Set(["test", "describe", "it", "suite", "context"]);
const WRAPPER_BASES = new Set(["vi", "vitest", "window", "globalThis", "global"]);

/**
 * @param {import("estree").MemberExpression} node
 */
function getPropertyName(node) {
    if (node.computed) {
        if (node.property.type === "Literal" && typeof node.property.value === "string") {
            return node.property.value;
        }
        return null;
    }

    if (node.property.type === "Identifier") {
        return node.property.name;
    }

    return null;
}

/**
 * @param {import("estree").Node} node
 * @returns {import("estree").Node}
 */
function unwrapExpression(node) {
    let current = node;

    while (
        current
        && (current.type === "ChainExpression" || current.type === "TSAsExpression"
            || current.type === "TSSatisfiesExpression" || current.type === "TSNonNullExpression")
    ) {
        if (current.type === "ChainExpression") {
            current = current.expression;
        } else {
            current = current.expression;
        }
    }

    return current;
}

/**
 * @param {import("estree").MemberExpression} memberExpression
 */
function getBaseAndProperties(memberExpression) {
    const properties = [];
    let current = memberExpression;

    while (current) {
        current = unwrapExpression(current);

        if (!current) {
            return { base: null, properties };
        }

        if (current.type === "Identifier") {
            return { base: current.name, properties };
        }

        if (current.type === "CallExpression") {
            current = current.callee;
            continue;
        }

        if (current.type !== "MemberExpression") {
            break;
        }

        const propertyName = getPropertyName(current);
        if (propertyName) {
            properties.push(propertyName);
        }

        current = current.object;
    }

    return { base: null, properties };
}

const rule = {
    meta: {
        type: "problem",
        docs: {
            description: "Disallow methods that skip or focus tests.",
        },
        schema: [],
        messages: {
            noSkippedTests:
                "Do not use '{{chain}}' because it prevents tests from running. Remove it so the test executes normally.",
        },
    },
    create(context) {
        return {
            MemberExpression(node) {
                const propertyName = getPropertyName(node);
                if (!propertyName || !BANNED_METHODS.has(propertyName)) {
                    return;
                }

                const { base, properties } = getBaseAndProperties(node);
                if (!base) {
                    return;
                }

                const restProperties = properties.slice(1);
                const baseMatches = DIRECT_BASES.has(base);
                const wrapperMatches = WRAPPER_BASES.has(base)
                    && restProperties.some((property) => DIRECT_BASES.has(property));
                const chainParts = [...properties, base].reverse();
                const chain = chainParts.join(".");

                if (baseMatches || wrapperMatches) {
                    context.report({
                        node,
                        messageId: "noSkippedTests",
                        data: { chain },
                    });
                }
            },
        };
    },
};

export default rule;
