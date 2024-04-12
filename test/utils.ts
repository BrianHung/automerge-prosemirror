import { assert } from "chai"
import { next as automerge } from "@automerge/automerge"
import { EditorState } from "prosemirror-state"
import { docFromSpans } from "../src/traversal"
import { Node } from "prosemirror-model"
import { schema } from "../src/schema"
import { AssertionError } from "assert"
import { applyBlockPatch } from "../src/maintainSpans"
import { next as am } from "@automerge/automerge"

export type BlockDef = {
  type: string
  parents: string[]
  attrs: Record<string, automerge.MaterializeValue>
}

export function docFromBlocksNotation(notation: (string | BlockDef)[]): {
  doc: automerge.Doc<{ text: string }>
  spans: automerge.Span[]
} {
  let doc = automerge.from({ text: "" })
  let index = 0
  doc = automerge.change(doc, doc => {
    for (const line of notation) {
      if (typeof line === "string") {
        automerge.splice(doc, ["text"], index, 0, line)
        index += line.length
      } else {
        const block = {
          type: new am.RawString(line.type),
          parents: line.parents.map(p => new am.RawString(p)),
          attrs: line.attrs,
        }
        automerge.splitBlock(doc, ["text"], index, block)
        index += 1
      }
    }
  })
  return { doc, spans: automerge.spans(doc, ["text"]) }
}

export function makeDoc(defs: (string | BlockDef)[]): {
  spans: automerge.Span[]
  doc: automerge.Doc<unknown>
  editor: EditorState
} {
  const { spans, doc } = docFromBlocksNotation(defs)
  const pmDoc = docFromSpans(spans)
  const editor = EditorState.create({ schema, doc: pmDoc })
  return { spans, doc, editor }
}

type PrintOptions = {
  includeMarks: boolean
}
export function printTree(
  node: Node,
  options: PrintOptions = { includeMarks: false },
): object | string {
  if (node.isText) {
    if (options.includeMarks) {
      return {
        text: node.textContent,
        marks: node.marks.map(mark => mark.type.name),
      }
    } else {
      return node.textContent
    }
  } else {
    const children: (object | string)[] = []
    for (let i = 0; i < node.childCount; i++) {
      children.push(printTree(node.child(i), options))
    }
    return {
      name: node.type.name,
      attrs: node.attrs,
      children,
    }
  }
}

export function splitBlock(
  index: number,
  block: BlockDef,
): (_: automerge.Prop[]) => automerge.Patch[] {
  return (path: automerge.Prop[]): automerge.Patch[] => {
    const patches: automerge.Patch[] = [
      {
        action: "insert",
        path: path.concat([index]),
        values: [{}],
      },
      {
        action: "put",
        path: path.concat([index, "type"]),
        value: new am.RawString(block.type),
      },
      {
        action: "put",
        path: path.concat([index, "parents"]),
        value: [],
      },
      {
        action: "put",
        path: path.concat([index, "attrs"]),
        value: {},
      },
    ]

    for (const [key, value] of Object.entries(block.attrs)) {
      patches.push({
        action: "put",
        path: path.concat([index, "attrs", key]),
        value: value,
      })
    }

    block.parents.forEach((parent, i) => {
      patches.push({
        action: "insert",
        path: path.concat([index, "parents", i]),
        values: [new am.RawString(parent)],
      })
    })

    return patches
  }
}

export function updateBlockType(
  index: number,
  newType: string,
): (_: automerge.Prop[]) => automerge.Patch[] {
  return (path: automerge.Prop[]): automerge.Patch[] => {
    return [
      {
        action: "put",
        path: path.concat([index, "type"]),
        value: new am.RawString(newType),
      },
    ]
  }
}

export function assertSplitBlock(
  diff: automerge.Patch[],
  path: automerge.Prop[],
  expected: BlockDef,
) {
  const start = diff.findIndex(
    patch => patch.action === "insert" && pathEquals(patch.path, path),
  )
  if (start === -1) {
    throw new AssertionError({
      message: "no insert patch found for path: " + path,
      expected: "a diff containing an insert patch for a lbock",
      actual: diff,
    })
  }
  const parentPath = path.slice(0, -1)

  const expectedSpan = {
    type: new am.RawString(expected.type),
    parents: expected.parents.map(p => new am.RawString(p)),
    attrs: expected.attrs,
  }

  // We skip the patch which creates the block
  const blockDiff = diff.slice(start + 1)
  const block = interpretPatch(blockDiff, parentPath)
  assert.deepStrictEqual(block, expectedSpan)
}

function interpretPatch(
  diff: automerge.Patch[],
  path: automerge.Prop[],
): { [key: string]: automerge.MaterializeValue } {
  const block = {}
  const blockPatches = diff.filter(p => pathIsPrefixOf(path, p.path))

  for (const patch of blockPatches) {
    applyBlockPatch(path, patch, block)
  }
  return block
}

function pathEquals(left: automerge.Prop[], right: automerge.Prop[]): boolean {
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false
  }
  return true
}

function pathIsPrefixOf(
  prefix: automerge.Prop[],
  path: automerge.Prop[],
): boolean {
  if (prefix.length > path.length) return false
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] !== path[i]) return false
  }
  return true
}
