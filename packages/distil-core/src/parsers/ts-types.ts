/**
 * Tree-sitter types (simplified for compatibility)
 *
 * Shared by TypeScriptParser, CFGBuilder, and DFGBuilder.
 */

export interface TSNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  children: TSNode[];
  firstChild: TSNode | null;
  firstNamedChild: TSNode | null;
}

export interface TSTree {
  rootNode: TSNode;
}

export interface TSParser {
  parse(source: string): TSTree;
  setLanguage(lang: unknown): void;
}
