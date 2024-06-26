/**
 * Credits
 * @Bkucera: https://github.com/cypress-io/cypress/issues/2839#issuecomment-447012818
 * @Phrogz: https://stackoverflow.com/a/10730777/1556245
 *
 * Usage
 * ```
 * // Types "foo" and then selects "fo"
 * cy.get('input')
 *   .type('foo')
 *   .setSelection('fo')
 *
 * // Types "foo", "bar", "baz", and "qux" on separate lines, then selects "foo", "bar", and "baz"
 * cy.get('textarea')
 *   .type('foo{enter}bar{enter}baz{enter}qux{enter}')
 *   .setSelection('foo', 'baz')
 *
 * // Types "foo" and then sets the cursor before the last letter
 * cy.get('input')
 *   .type('foo')
 *   .setCursorAfter('fo')
 *
 * // Types "foo" and then sets the cursor at the beginning of the word
 * cy.get('input')
 *   .type('foo')
 *   .setCursorBefore('foo')
 *
 * // `setSelection` can alternatively target starting and ending nodes using query strings,
 * // plus specific offsets. The queries are processed via `Element.querySelector`.
 * cy.get('body')
 *   .setSelection({
 *     anchorQuery: 'ul > li > p', // required
 *     anchorOffset: 2 // default: 0
 *     focusQuery: 'ul > li > p:last-child', // default: anchorQuery
 *     focusOffset: 0 // default: 0
 *    })
 */

// Low level command reused by `setSelection` and low level command `setCursor`
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
Cypress.Commands.add("selection", { prevSubject: true }, (subject, fn) => {
  cy.wrap(subject).trigger("mousedown").then(fn).trigger("mouseup")

  cy.document().trigger("selectionchange")
  return cy.wrap(subject)
})

Cypress.Commands.add(
  "setSelection",
  { prevSubject: true },
  (subject, query, endQuery) => {
    return cy.wrap(subject).selection($el => {
      if (typeof query === "string") {
        const anchorNode = getTextNode($el[0], query)
        const focusNode = endQuery ? getTextNode($el[0], endQuery) : anchorNode
        let anchorOffset = -1
        if (anchorNode instanceof Text) {
          anchorOffset = anchorNode.wholeText.indexOf(query)
        }
        let endOffset = -1
        if (focusNode instanceof Text && endQuery) {
          endOffset = focusNode.wholeText.indexOf(endQuery)
        }
        const focusOffset = endQuery
          ? endOffset + endQuery.length
          : anchorOffset + query.length
        setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset)
      }
    })
  },
)

// Low level command reused by `setCursorBefore` and `setCursorAfter`, equal to `setCursorAfter`
Cypress.Commands.add(
  "setCursor",
  { prevSubject: true },
  (subject, query, atStart) => {
    return cy.wrap(subject).selection($el => {
      const node = getTextNode($el[0], query)
      let queryOffset = -1
      if (node instanceof Text) {
        queryOffset = node.wholeText.indexOf(query)
      }
      const offset = queryOffset + (atStart ? 0 : query.length)
      const document = node?.ownerDocument
      document?.getSelection()?.removeAllRanges()
      document?.getSelection()?.collapse(node, offset)
    })
    // Depending on what you're testing, you may need to chain a `.click()` here to ensure
    // further commands are picked up by whatever you're testing (this was required for Slate, for example).
  },
)

Cypress.Commands.add(
  "setCursorBefore",
  { prevSubject: true },
  (subject, query) => {
    cy.wrap(subject).setCursor(query, true)
  },
)

Cypress.Commands.add(
  "setCursorAfter",
  { prevSubject: true },
  (subject, query) => {
    cy.wrap(subject).setCursor(query)
  },
)

// Helper functions
function getTextNode(el: Element, match?: string) {
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null)
  if (!match) {
    return walk.nextNode()
  }

  let node: Node | null = walk.nextNode()
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (node instanceof Text && node.wholeText.includes(match)) {
      return node
    }
    node = walk.nextNode()
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setBaseAndExtent(...args: any[]) {
  const document = args[0].ownerDocument
  document.getSelection().removeAllRanges()
  document.getSelection().setBaseAndExtent(...args)
}
