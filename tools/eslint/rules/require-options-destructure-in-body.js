/**
 * Requires a function's single object parameter to be named `options`,
 * destructured in the body instead of the parameter list.
 * Skips the fix, but still reports, when `options` is already used in the body.
 */
export default {
    create(context) {
        const sourceCode = context.sourceCode ?? context.getSourceCode();

        function checkFunction(node) {
            if (!node.body || node.params.length !== 1) {
                return;
            }

            const [param] = node.params;
            const isDefaulted = param.type === "AssignmentPattern";
            const pattern = isDefaulted ? param.left : param;

            if (pattern.type !== "ObjectPattern") {
                return;
            }

            context.report({
                fix(fixer) {
                    const bodyText = sourceCode.getText(node.body);

                    if (/\boptions\b/.test(bodyText)) {
                        return null;
                    }

                    const typeAnnotationText = pattern.typeAnnotation
                        ? sourceCode.getText(pattern.typeAnnotation)
                        : "";
                    // The pattern node's own range swallows its trailing type annotation,
                    // so that suffix is trimmed off here to leave just the `{ ... }` shape.
                    const patternText = typeAnnotationText
                        ? sourceCode
                              .getText(pattern)
                              .slice(0, -typeAnnotationText.length)
                        : sourceCode.getText(pattern);
                    const defaultText = isDefaulted
                        ? ` = ${sourceCode.getText(param.right)}`
                        : "";
                    const declaration = `const ${patternText} = options;`;

                    const paramFix = fixer.replaceText(
                        param,
                        `options${typeAnnotationText}${defaultText}`,
                    );

                    if (node.body.type === "BlockStatement") {
                        return [
                            paramFix,
                            fixer.insertTextAfter(
                                sourceCode.getFirstToken(node.body),
                                `\n${declaration}\n`,
                            ),
                        ];
                    }

                    // A concise arrow body has no braces to insert into, so it gains one.
                    // The replaced range runs from the arrow token to the node's own end,
                    // which also swallows any wrapping parens, e.g. `=> ({ ... })`.
                    const arrowToken = sourceCode.getTokenBefore(
                        node.body,
                        (token) => token.value === "=>",
                    );

                    return [
                        paramFix,
                        fixer.replaceTextRange(
                            [arrowToken.range[1], node.range[1]],
                            ` {\n${declaration}\n\nreturn ${bodyText};\n}`,
                        ),
                    ];
                },
                messageId: "destructureInBody",
                node: param,
            });
        }

        return {
            ArrowFunctionExpression: checkFunction,
            FunctionDeclaration: checkFunction,
            FunctionExpression: checkFunction,
        };
    },
    meta: {
        docs: {
            description:
                "require a function's single object parameter to be named `options` and destructured in the body, not the signature",
        },
        fixable: "code",
        messages: {
            destructureInBody:
                "Destructure `options` in the function body instead of the parameter list.",
        },
        schema: [],
        type: "suggestion",
    },
};
