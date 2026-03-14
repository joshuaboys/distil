/**
 * DFG Builder for TypeScript/JavaScript
 *
 * Extracted from typescript.ts for maintainability.
 */

import type { TSNode } from "./ts-types.js";
import type { DFGInfo, VarRef, DefUseEdge, RefType } from "../types/index.js";
import { createDFGInfo } from "../types/dfg.js";

/**
 * Built-in identifiers to skip during DFG analysis.
 * Hoisted to module level to avoid per-call Set allocation.
 */
const DFG_BUILTIN_IDENTIFIERS = new Set([
  "true",
  "false",
  "null",
  "undefined",
  "this",
  "super",
  "console",
  "Math",
  "Object",
  "Array",
  "String",
  "Number",
  "Boolean",
  "Error",
  "Promise",
  "JSON",
  "Date",
  "RegExp",
]);

export class DFGBuilder {
  private filePath: string;
  private functionName: string;
  private refs: VarRef[] = [];
  private edges: DefUseEdge[] = [];
  private variables = new Set<string>();
  private parameters: VarRef[] = [];
  private returns: VarRef[] = [];
  private currentScope: string;
  private defMap = new Map<string, VarRef[]>(); // variable -> definitions

  constructor(filePath: string, functionName: string) {
    this.filePath = filePath;
    this.functionName = functionName;
    this.currentScope = functionName;
  }

  extractParameters(paramsNode: TSNode): void {
    for (const child of paramsNode.children) {
      if (
        child.type === "required_parameter" ||
        child.type === "optional_parameter" ||
        child.type === "rest_parameter"
      ) {
        const nameNode = child.children.find((c) => c.type === "identifier");
        if (nameNode) {
          const ref = this.createRef(nameNode, "param");
          this.parameters.push(ref);
          this.addDefinition(nameNode.text, ref);
        }
      }
    }
  }

  processNode(node: TSNode): void {
    this.traverse(node, false);
    this.buildDefUseEdges();
  }

  private traverse(node: TSNode, inAssignmentLHS: boolean): void {
    switch (node.type) {
      case "lexical_declaration":
      case "variable_declaration":
        this.processVariableDeclaration(node);
        break;

      case "assignment_expression":
        this.processAssignment(node);
        break;

      case "update_expression":
        this.processUpdate(node);
        break;

      case "identifier":
        // Only process as use if not in definition position
        if (!inAssignmentLHS) {
          this.processIdentifier(node, "use");
        }
        break;

      case "return_statement":
        this.processReturn(node);
        break;

      case "arrow_function":
      case "function_expression":
        // Nested function - captures variables from outer scope
        this.processNestedFunction(node);
        return; // Don't recurse into nested functions normally

      default:
        // Recurse into children
        for (const child of node.children) {
          this.traverse(child, inAssignmentLHS);
        }
    }
  }

  private processVariableDeclaration(node: TSNode): void {
    for (const child of node.children) {
      if (child.type === "variable_declarator") {
        const nameNode = child.children.find((c) => c.type === "identifier");
        const valueNode = child.children.find(
          (c) => c.type !== "identifier" && c.type !== "=" && c.type !== "type_annotation",
        );

        if (nameNode) {
          const ref = this.createRef(nameNode, "def");
          this.addDefinition(nameNode.text, ref);
        }

        // Process the initializer for uses
        if (valueNode) {
          this.traverse(valueNode, false);
        }
      }
    }
  }

  private processAssignment(node: TSNode): void {
    const children = node.children;
    const left = children[0];
    const right = children[2]; // Skip '='

    // Left side is a definition
    if (left?.type === "identifier") {
      const ref = this.createRef(left, "def");
      this.addDefinition(left.text, ref);
    } else if (left) {
      // Could be member expression, etc. - traverse but mark as LHS
      this.traverse(left, true);
    }

    // Right side is a use
    if (right) {
      this.traverse(right, false);
    }
  }

  private processUpdate(node: TSNode): void {
    // x++ or ++x is both a use and a def
    const operand = node.children.find((c) => c.type === "identifier");
    if (operand) {
      const ref = this.createRef(operand, "update");
      this.addDefinition(operand.text, ref);
    }
  }

  private processIdentifier(node: TSNode, type: RefType): void {
    if (DFG_BUILTIN_IDENTIFIERS.has(node.text)) return;

    // createRef already adds to this.refs and this.variables
    this.createRef(node, type);
  }

  private processReturn(node: TSNode): void {
    // Process return value for uses
    for (const child of node.children) {
      if (child.type === "return") continue;

      if (child.type === "identifier") {
        // Create a single ref for the returned identifier and track it
        const ref = this.createRef(child, "use");
        this.returns.push(ref);
      } else {
        // For non-identifier return expressions, traverse normally
        this.traverse(child, false);
      }
    }
  }

  private processNestedFunction(node: TSNode): void {
    // Find identifiers that are captures (used but not defined in nested scope)
    const nestedVars = new Set<string>();
    const nestedDefs = new Set<string>();

    const collectVars = (n: TSNode): void => {
      if (n.type === "identifier") {
        nestedVars.add(n.text);
      }
      if (n.type === "variable_declarator") {
        const nameNode = n.children.find((c) => c.type === "identifier");
        if (nameNode) nestedDefs.add(nameNode.text);
      }
      if (n.type === "formal_parameters") {
        for (const c of n.children) {
          const nameNode = c.children?.find((cc) => cc.type === "identifier");
          if (nameNode) nestedDefs.add(nameNode.text);
        }
      }
      for (const c of n.children) {
        collectVars(c);
      }
    };

    collectVars(node);

    // Variables used but not defined in nested scope are captures
    for (const v of nestedVars) {
      if (!nestedDefs.has(v) && this.variables.has(v)) {
        const ref: VarRef = {
          name: v,
          type: "capture",
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
          location: {
            line: node.startPosition.row + 1,
            column: node.startPosition.column,
          },
          scope: this.currentScope,
          isInClosure: true,
          expression: "closure capture",
        };
        this.refs.push(ref);
      }
    }
  }

  private createRef(node: TSNode, type: RefType): VarRef {
    const ref: VarRef = {
      name: node.text,
      type,
      line: node.startPosition.row + 1,
      column: node.startPosition.column,
      location: {
        line: node.startPosition.row + 1,
        column: node.startPosition.column,
      },
      scope: this.currentScope,
      isInClosure: false,
      expression: null,
    };
    this.refs.push(ref);
    this.variables.add(node.text);
    return ref;
  }

  private addDefinition(name: string, ref: VarRef): void {
    const defs = this.defMap.get(name) ?? [];
    defs.push(ref);
    this.defMap.set(name, defs);
  }

  private buildDefUseEdges(): void {
    // NOTE: A sound reaching-definitions analysis must account for control
    // flow (for example, mutually exclusive branches in if/else, loops,
    // early returns, etc.). The simple line-number heuristic previously used
    // here produced incorrect def-use edges.
    //
    // For now, we use a conservative approximation: for each use, we connect
    // it to the most recent definition of the same variable (by line number).
    // This may miss some valid edges but avoids false positives.

    const uses = this.refs.filter(
      (r) => r.type === "use" || r.type === "update" || r.type === "capture",
    );

    for (const use of uses) {
      const defs = this.defMap.get(use.name) ?? [];

      // Find the most recent definition before this use
      const reachingDefs = defs.filter((d) => d.line <= use.line);
      if (reachingDefs.length === 0) continue;

      // Sort by line descending and take the most recent
      reachingDefs.sort((a, b) => b.line - a.line);
      const mostRecentDef = reachingDefs[0];
      if (!mostRecentDef) continue;

      // Check if there might be other paths (conservative: mark as may-reach
      // if there are multiple definitions)
      const isMayReach = reachingDefs.length > 1;

      const edge: DefUseEdge = {
        variable: use.name,
        def: mostRecentDef,
        use,
        isMayReach,
        hasInterveningDef: false,
      };
      this.edges.push(edge);
    }
  }

  getDFG(): DFGInfo {
    return createDFGInfo({
      functionName: this.functionName,
      filePath: this.filePath,
      refs: this.refs,
      edges: this.edges,
      variables: Array.from(this.variables),
      parameters: this.parameters,
      returns: this.returns,
      reachingDefs: new Map(),
      liveVars: new Map(),
    });
  }
}
