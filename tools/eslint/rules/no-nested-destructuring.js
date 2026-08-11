/**
 * Forbids destructuring a nested object in the same statement as its parent.
 * Each level gets its own separate destructuring line, not a pattern with an object nested inside it.
 */
export default {
    create(context) {
        const sourceCode = context.sourceCode ?? context.getSourceCode();

        return {
            VariableDeclaration(node) {
                if (node.declarations.length !== 1) {
                    return;
                }

                const [declarator] = node.declarations;

                if (
                    declarator.id.type !== "ObjectPattern" ||
                    !declarator.init ||
                    !hasNestedObjectPattern(declarator.id)
                ) {
                    return;
                }

                context.report({
                    fix(fixer) {
                        const initText = sourceCode.getText(declarator.init);
                        const lines = [];

                        flatten(declarator.id, initText, sourceCode, lines);

                        const statements = lines
                            .map(
                                (line) =>
                                    `${node.kind} ${line.patternText} = ${line.exprText};`,
                            )
                            .join("\n\n");

                        return fixer.replaceText(node, statements);
                    },
                    messageId: "noNestedDestructuring",
                    node: declarator.id,
                });
            },
        };
    },
    meta: {
        docs: {
            description:
                "forbid destructuring a nested object in the same statement as its parent, each level gets its own declaration",
        },
        fixable: "code",
        messages: {
            noNestedDestructuring:
                "Destructure a nested object in its own statement, not inside the outer pattern.",
        },
        schema: [],
        type: "suggestion",
    },
};

/*
 * Internal.
 */

function hasNestedObjectPattern(pattern) {
    return pattern.properties.some(
        (property) =>
            property.type === "Property" &&
            !property.computed &&
            property.key.type === "Identifier" &&
            property.value.type === "ObjectPattern",
    );
}

/**
 * Walks a (possibly nested) object pattern,
 * appending one flat entry per destructuring level,
 * each holding a pattern and its source text.
 */
function flatten(pattern, exprText, sourceCode, lines) {
    const topLevelParts = [];
    const nestedProperties = [];

    for (const property of pattern.properties) {
        const isNested =
            property.type === "Property" &&
            !property.computed &&
            property.key.type === "Identifier" &&
            property.value.type === "ObjectPattern";

        if (isNested) {
            topLevelParts.push(property.key.name);
            nestedProperties.push(property);
        } else {
            topLevelParts.push(sourceCode.getText(property));
        }
    }

    lines.push({
        exprText: exprText,
        patternText: `{ ${topLevelParts.join(", ")} }`,
    });

    for (const property of nestedProperties) {
        flatten(property.value, property.key.name, sourceCode, lines);
    }
}
