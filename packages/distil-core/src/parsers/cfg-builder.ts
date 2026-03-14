/**
 * CFG Builder for TypeScript/JavaScript
 *
 * Extracted from typescript.ts for maintainability.
 */

import type { TSNode } from "./ts-types.js";
import type { CFGInfo, CFGBlock, BlockType, EdgeType } from "../types/index.js";
import { createCFGInfo, calculateCyclomaticComplexity } from "../types/cfg.js";

export class CFGBuilder {
  private filePath: string;
  private functionName: string;
  private blocks: CFGBlock[] = [];
  private edges: Array<{
    from: number;
    to: number;
    type: EdgeType;
    condition: string | null;
    isBackEdge: boolean;
  }> = [];
  private blockId = 0;
  private currentNestingDepth = 0;
  private maxNestingDepth = 0;
  private decisionPoints = 0;
  private nestedFunctions = new Map<string, CFGInfo>();

  constructor(filePath: string, functionName: string) {
    this.filePath = filePath;
    this.functionName = functionName;
  }

  buildFromBody(bodyNode: TSNode): void {
    // Create entry block
    const entryBlock = this.createBlock("entry", bodyNode);

    // Process the body
    if (bodyNode.type === "statement_block") {
      const exitBlocks = this.processStatements(bodyNode.children, [entryBlock.id]);
      // Create exit block and connect
      const exitBlock = this.createBlock("exit", bodyNode);
      for (const blockId of exitBlocks) {
        this.addEdge(blockId, exitBlock.id, "unconditional");
      }
    } else {
      // Expression body (arrow function)
      const exprBlock = this.createBlock("return", bodyNode);
      exprBlock.statements = [this.getNodeText(bodyNode)];
      this.extractVarsFromNode(bodyNode, exprBlock);
      this.addEdge(entryBlock.id, exprBlock.id, "unconditional");

      const exitBlock = this.createBlock("exit", bodyNode);
      this.addEdge(exprBlock.id, exitBlock.id, "return");
    }
  }

  private processStatements(nodes: TSNode[], predecessors: number[]): number[] {
    let currentPredecessors = predecessors;

    for (const node of nodes) {
      if (this.isIgnoredNode(node)) continue;

      const result = this.processStatement(node, currentPredecessors);
      currentPredecessors = result;
    }

    return currentPredecessors;
  }

  private isIgnoredNode(node: TSNode): boolean {
    return node.type === "{" || node.type === "}" || node.type === ";" || node.type === "comment";
  }

  private processStatement(node: TSNode, predecessors: number[]): number[] {
    switch (node.type) {
      case "if_statement":
        return this.processIfStatement(node, predecessors);

      case "for_statement":
      case "for_in_statement":
      case "for_of_statement":
        return this.processForStatement(node, predecessors);

      case "while_statement":
        return this.processWhileStatement(node, predecessors);

      case "do_statement":
        return this.processDoWhileStatement(node, predecessors);

      case "switch_statement":
        return this.processSwitchStatement(node, predecessors);

      case "try_statement":
        return this.processTryStatement(node, predecessors);

      case "return_statement":
        return this.processReturnStatement(node, predecessors);

      case "throw_statement":
        return this.processThrowStatement(node, predecessors);

      case "break_statement":
      case "continue_statement":
        // These will be handled by loop/switch context
        return this.processBreakContinue(node, predecessors);

      default:
        return this.processBasicStatement(node, predecessors);
    }
  }

  private processIfStatement(node: TSNode, predecessors: number[]): number[] {
    this.decisionPoints++;
    this.currentNestingDepth++;
    this.maxNestingDepth = Math.max(this.maxNestingDepth, this.currentNestingDepth);

    // Create branch block for the condition
    const branchBlock = this.createBlock("branch", node);
    const condition = node.children.find((c) => c.type === "parenthesized_expression");
    if (condition) {
      branchBlock.statements = [this.getNodeText(condition)];
      this.extractVarsFromNode(condition, branchBlock);
    }

    // Connect predecessors to branch
    for (const predId of predecessors) {
      this.addEdge(predId, branchBlock.id, "unconditional");
    }

    const exitBlocks: number[] = [];

    // Process consequence (then branch) - find first statement_block or expression statement
    // that comes after the condition but isn't part of else clause
    const consequence = node.children.find(
      (c) =>
        c.type === "statement_block" ||
        (c.type === "expression_statement" && c !== condition) ||
        c.type === "return_statement" ||
        (c.type === "if_statement" &&
          node.children.indexOf(c) <
            (node.children.findIndex((x) => x.type === "else_clause") || Infinity)),
    );
    if (consequence) {
      const thenEntry = this.createBlock("body", consequence);
      this.addEdge(branchBlock.id, thenEntry.id, "true", this.getConditionText(condition));

      let thenExits: number[];
      if (consequence.type === "statement_block") {
        thenExits = this.processStatements(consequence.children, [thenEntry.id]);
      } else {
        thenEntry.statements = [this.getNodeText(consequence)];
        this.extractVarsFromNode(consequence, thenEntry);
        thenExits = [thenEntry.id];
      }
      exitBlocks.push(...thenExits);
    }

    // Process alternative (else branch)
    const elseClause = node.children.find((c) => c.type === "else_clause");
    if (elseClause) {
      const elseBody = elseClause.children.find(
        (c) => c.type === "statement_block" || c.type === "if_statement",
      );
      if (elseBody) {
        if (elseBody.type === "if_statement") {
          // else if - create explicit false edge, then recurse
          // First create a connector block for the else-if branch
          const elseIfBranchBlock = this.createBlock("branch", elseBody);
          this.addEdge(
            branchBlock.id,
            elseIfBranchBlock.id,
            "false",
            `!(${this.getConditionText(condition)})`,
          );

          // Now process the else-if with the new branch block as predecessor
          const elseIfExits = this.processIfStatement(elseBody, [elseIfBranchBlock.id]);
          exitBlocks.push(...elseIfExits);
        } else {
          const elseEntry = this.createBlock("body", elseBody);
          this.addEdge(
            branchBlock.id,
            elseEntry.id,
            "false",
            `!(${this.getConditionText(condition)})`,
          );

          let elseExits: number[];
          if (elseBody.type === "statement_block") {
            elseExits = this.processStatements(elseBody.children, [elseEntry.id]);
          } else {
            elseEntry.statements = [this.getNodeText(elseBody)];
            this.extractVarsFromNode(elseBody, elseEntry);
            elseExits = [elseEntry.id];
          }
          exitBlocks.push(...elseExits);
        }
      }
    } else {
      // No else - branch directly to merge point
      exitBlocks.push(branchBlock.id);
    }

    this.currentNestingDepth--;
    return exitBlocks;
  }

  private processForStatement(node: TSNode, predecessors: number[]): number[] {
    this.decisionPoints++;
    this.currentNestingDepth++;
    this.maxNestingDepth = Math.max(this.maxNestingDepth, this.currentNestingDepth);

    // Create header block for loop condition
    const headerBlock = this.createBlock("loop_header", node);

    // Extract init, condition, update for for-loops
    let initNode: TSNode | null = null;
    let condNode: TSNode | null = null;
    let updateNode: TSNode | null = null;
    let body: TSNode | null = null;

    if (node.type === "for_statement") {
      // for (init; cond; update) body
      // Parse by tracking semicolons to identify init, condition, and update
      let semiCount = 0;
      for (const child of node.children) {
        if (child.type === ";") {
          semiCount++;
          continue;
        }
        if (child.type === "for" || child.type === "(" || child.type === ")") {
          continue;
        }
        if (child.type === "statement_block") {
          body = child;
          continue;
        }
        // Assign based on position relative to semicolons
        if (semiCount === 0) {
          initNode = child;
        } else if (semiCount === 1) {
          condNode = child;
        } else if (semiCount === 2) {
          updateNode = child;
        }
      }
    } else {
      // for-in / for-of
      condNode =
        node.children.find(
          (c) =>
            c.type !== "for" && c.type !== "(" && c.type !== ")" && c.type !== "statement_block",
        ) ?? null;
      body = node.children.find((c) => c.type === "statement_block") ?? null;
    }

    if (initNode) {
      headerBlock.statements.push(this.getNodeText(initNode));
      this.extractVarsFromNode(initNode, headerBlock);
    }
    if (condNode) {
      headerBlock.statements.push(this.getNodeText(condNode));
      this.extractVarsFromNode(condNode, headerBlock);
    }
    if (updateNode) {
      headerBlock.statements.push(this.getNodeText(updateNode));
      this.extractVarsFromNode(updateNode, headerBlock);
    }

    // Connect predecessors to header
    for (const predId of predecessors) {
      this.addEdge(predId, headerBlock.id, "unconditional");
    }

    // Process body
    const exitBlocks: number[] = [];
    if (body) {
      const bodyEntry = this.createBlock("loop_body", body);
      this.addEdge(headerBlock.id, bodyEntry.id, "true", this.getNodeText(condNode));

      const bodyExits = this.processStatements(body.children, [bodyEntry.id]);

      // Back edge to header
      for (const exitId of bodyExits) {
        this.addEdge(exitId, headerBlock.id, "back_edge", null, true);
      }
    }

    // Exit when condition is false
    exitBlocks.push(headerBlock.id);

    this.currentNestingDepth--;
    return exitBlocks;
  }

  private processWhileStatement(node: TSNode, predecessors: number[]): number[] {
    this.decisionPoints++;
    this.currentNestingDepth++;
    this.maxNestingDepth = Math.max(this.maxNestingDepth, this.currentNestingDepth);

    const headerBlock = this.createBlock("loop_header", node);
    const condition = node.children.find((c) => c.type === "parenthesized_expression");
    if (condition) {
      headerBlock.statements = [this.getNodeText(condition)];
      this.extractVarsFromNode(condition, headerBlock);
    }

    for (const predId of predecessors) {
      this.addEdge(predId, headerBlock.id, "unconditional");
    }

    const body = node.children.find((c) => c.type === "statement_block");
    if (body) {
      const bodyEntry = this.createBlock("loop_body", body);
      this.addEdge(headerBlock.id, bodyEntry.id, "true", this.getConditionText(condition));

      const bodyExits = this.processStatements(body.children, [bodyEntry.id]);
      for (const exitId of bodyExits) {
        this.addEdge(exitId, headerBlock.id, "back_edge", null, true);
      }
    }

    this.currentNestingDepth--;
    return [headerBlock.id];
  }

  private processDoWhileStatement(node: TSNode, predecessors: number[]): number[] {
    this.decisionPoints++;
    this.currentNestingDepth++;
    this.maxNestingDepth = Math.max(this.maxNestingDepth, this.currentNestingDepth);

    // Body executes first
    const body = node.children.find((c) => c.type === "statement_block");
    const bodyEntry = this.createBlock("loop_body", body ?? node);

    for (const predId of predecessors) {
      this.addEdge(predId, bodyEntry.id, "unconditional");
    }

    let bodyExits: number[] = [bodyEntry.id];
    if (body) {
      bodyExits = this.processStatements(body.children, [bodyEntry.id]);
    }

    // Then check condition
    const condition = node.children.find((c) => c.type === "parenthesized_expression");
    const headerBlock = this.createBlock("loop_header", node);
    if (condition) {
      headerBlock.statements = [this.getNodeText(condition)];
      this.extractVarsFromNode(condition, headerBlock);
    }

    for (const exitId of bodyExits) {
      this.addEdge(exitId, headerBlock.id, "unconditional");
    }

    // Back edge to body
    this.addEdge(headerBlock.id, bodyEntry.id, "back_edge", this.getConditionText(condition), true);

    this.currentNestingDepth--;
    return [headerBlock.id];
  }

  private processSwitchStatement(node: TSNode, predecessors: number[]): number[] {
    this.currentNestingDepth++;
    this.maxNestingDepth = Math.max(this.maxNestingDepth, this.currentNestingDepth);

    const branchBlock = this.createBlock("branch", node);
    const value = node.children.find((c) => c.type === "parenthesized_expression");
    if (value) {
      branchBlock.statements = [this.getNodeText(value)];
      this.extractVarsFromNode(value, branchBlock);
    }

    for (const predId of predecessors) {
      this.addEdge(predId, branchBlock.id, "unconditional");
    }

    const switchBody = node.children.find((c) => c.type === "switch_body");
    const exitBlocks: number[] = [];

    if (switchBody) {
      let prevCaseExits: number[] = [];

      for (const child of switchBody.children) {
        if (child.type === "switch_case" || child.type === "switch_default") {
          this.decisionPoints++;

          const isDefault = child.type === "switch_default";
          const caseBlock = this.createBlock("body", child);

          // Edge from branch to case
          const caseLabel = isDefault
            ? "default"
            : (child.children.find((c) => c.type !== "case" && c.type !== ":")?.text ?? "case");
          this.addEdge(branchBlock.id, caseBlock.id, isDefault ? "default" : "case", caseLabel);

          // Fallthrough from previous case
          for (const prevId of prevCaseExits) {
            this.addEdge(prevId, caseBlock.id, "fallthrough");
          }

          // Process case statements
          const stmts = child.children.filter(
            (c) => c.type !== "case" && c.type !== "default" && c.type !== ":",
          );

          // Start with the case block itself as the initial exit
          let caseExits: number[] = [caseBlock.id];
          if (stmts.length > 0) {
            caseBlock.statements = stmts.map((s) => this.getNodeText(s));
            for (const stmt of stmts) {
              this.extractVarsFromNode(stmt, caseBlock);
            }
            // Build CFG for nested control flow within the case body
            caseExits = this.processStatements(stmts, [caseBlock.id]);
          }

          // Check for break
          const hasBreak = stmts.some((s) => s.type === "break_statement");
          if (hasBreak) {
            // Cases with a break exit the switch via the exits of the case body
            exitBlocks.push(...caseExits);
            prevCaseExits = [];
          } else {
            // Cases without a break fall through from the exits of the case body
            prevCaseExits = caseExits;
          }
        }
      }

      // Remaining cases without break fall through to exit
      exitBlocks.push(...prevCaseExits);
    }

    this.currentNestingDepth--;
    return exitBlocks.length > 0 ? exitBlocks : [branchBlock.id];
  }

  private processTryStatement(node: TSNode, predecessors: number[]): number[] {
    this.currentNestingDepth++;
    this.maxNestingDepth = Math.max(this.maxNestingDepth, this.currentNestingDepth);

    const exitBlocks: number[] = [];

    // Try block
    const tryBody = node.children.find((c) => c.type === "statement_block");
    if (tryBody) {
      const tryBlock = this.createBlock("try", tryBody);
      for (const predId of predecessors) {
        this.addEdge(predId, tryBlock.id, "unconditional");
      }

      const tryExits = this.processStatements(tryBody.children, [tryBlock.id]);
      exitBlocks.push(...tryExits);
    }

    // Catch clause
    const catchClause = node.children.find((c) => c.type === "catch_clause");
    if (catchClause) {
      const catchBody = catchClause.children.find((c) => c.type === "statement_block");
      if (catchBody) {
        const catchBlock = this.createBlock("catch", catchBody);
        // Exception edge from try
        if (tryBody) {
          const tryBlockId = this.blocks.find((b) => b.type === "try")?.id;
          if (tryBlockId !== undefined) {
            this.addEdge(tryBlockId, catchBlock.id, "throw");
          }
        }
        const catchExits = this.processStatements(catchBody.children, [catchBlock.id]);
        exitBlocks.push(...catchExits);
      }
    }

    // Finally clause
    const finallyClause = node.children.find((c) => c.type === "finally_clause");
    if (finallyClause) {
      const finallyBody = finallyClause.children.find((c) => c.type === "statement_block");
      if (finallyBody) {
        const finallyBlock = this.createBlock("finally", finallyBody);
        // Connect all exits to finally
        const currentExits = [...exitBlocks];
        exitBlocks.length = 0;

        for (const exitId of currentExits) {
          this.addEdge(exitId, finallyBlock.id, "unconditional");
        }

        const finallyExits = this.processStatements(finallyBody.children, [finallyBlock.id]);
        exitBlocks.push(...finallyExits);
      }
    }

    this.currentNestingDepth--;
    return exitBlocks;
  }

  private processReturnStatement(node: TSNode, predecessors: number[]): number[] {
    const returnBlock = this.createBlock("return", node);
    returnBlock.statements = [this.getNodeText(node)];
    this.extractVarsFromNode(node, returnBlock);

    for (const predId of predecessors) {
      this.addEdge(predId, returnBlock.id, "unconditional");
    }

    // Return doesn't flow to next statement
    return [];
  }

  private processThrowStatement(node: TSNode, predecessors: number[]): number[] {
    const throwBlock = this.createBlock("throw", node);
    throwBlock.statements = [this.getNodeText(node)];
    this.extractVarsFromNode(node, throwBlock);

    for (const predId of predecessors) {
      this.addEdge(predId, throwBlock.id, "unconditional");
    }

    // Throw doesn't flow to next statement
    return [];
  }

  private processBreakContinue(node: TSNode, predecessors: number[]): number[] {
    const block = this.createBlock("body", node);
    block.statements = [this.getNodeText(node)];

    for (const predId of predecessors) {
      this.addEdge(predId, block.id, "unconditional");
    }

    // These don't flow normally - handled by loop/switch context
    return [];
  }

  private processBasicStatement(node: TSNode, predecessors: number[]): number[] {
    const block = this.createBlock("body", node);
    block.statements = [this.getNodeText(node)];
    this.extractVarsFromNode(node, block);

    for (const predId of predecessors) {
      this.addEdge(predId, block.id, "unconditional");
    }

    return [block.id];
  }

  private createBlock(type: BlockType, node: TSNode): CFGBlock {
    const block: CFGBlock = {
      id: this.blockId++,
      type,
      lines: [node.startPosition.row + 1, node.endPosition.row + 1],
      range: {
        start: { line: node.startPosition.row + 1, column: node.startPosition.column },
        end: { line: node.endPosition.row + 1, column: node.endPosition.column },
      },
      statements: [],
      calls: [],
      defines: [],
      uses: [],
    };
    this.blocks.push(block);
    return block;
  }

  private addEdge(
    from: number,
    to: number,
    type: EdgeType,
    condition: string | null = null,
    isBackEdge: boolean = false,
  ): void {
    this.edges.push({
      from,
      to,
      type,
      condition,
      isBackEdge,
    });
  }

  private getNodeText(node: TSNode | null | undefined): string {
    if (!node) return "";
    return node.text.trim();
  }

  private getConditionText(node: TSNode | null | undefined): string {
    if (!node) return "";
    // Remove outer parens
    let text = node.text.trim();
    if (text.startsWith("(") && text.endsWith(")")) {
      text = text.slice(1, -1);
    }
    return text;
  }

  private extractVarsFromNode(node: TSNode, block: CFGBlock): void {
    this.traverseForVars(node, block, false);
  }

  private traverseForVars(node: TSNode, block: CFGBlock, inDefPosition: boolean): void {
    // Check for assignments (defines)
    if (node.type === "assignment_expression") {
      const left = node.children[0];
      if (left?.type === "identifier") {
        if (!block.defines.includes(left.text)) {
          block.defines.push(left.text);
        }
      }
      // Left side is definition position, right side is use position
      if (left) {
        this.traverseForVars(left, block, true);
      }
      const right = node.children[2]; // Skip '='
      if (right) {
        this.traverseForVars(right, block, false);
      }
      return;
    }

    // Check for variable declarations (defines)
    if (node.type === "variable_declarator") {
      const nameNode = node.children.find((c) => c.type === "identifier");
      if (nameNode && !block.defines.includes(nameNode.text)) {
        block.defines.push(nameNode.text);
      }
      // Process initializer as use position (skip the name identifier)
      for (const child of node.children) {
        if (child.type !== "identifier" && child.type !== "=" && child.type !== "type_annotation") {
          this.traverseForVars(child, block, false);
        }
      }
      return;
    }

    // Check for identifiers (uses) - but not in definition position
    if (node.type === "identifier") {
      if (!inDefPosition && !block.uses.includes(node.text) && !block.defines.includes(node.text)) {
        block.uses.push(node.text);
      }
      return;
    }

    // Check for function calls
    if (node.type === "call_expression") {
      const callee = node.firstChild;
      if (callee) {
        let calleeName = "";
        if (callee.type === "identifier") {
          calleeName = callee.text;
        } else if (callee.type === "member_expression") {
          const prop = callee.children.find((c) => c.type === "property_identifier");
          if (prop) calleeName = prop.text;
        }
        if (calleeName && !block.calls.includes(calleeName)) {
          block.calls.push(calleeName);
        }
      }
    }

    // Recurse into children (default: not in definition position)
    for (const child of node.children) {
      this.traverseForVars(child, block, inDefPosition);
    }
  }

  getCFG(): CFGInfo {
    const entryBlock = this.blocks.find((b) => b.type === "entry")?.id ?? 0;
    const exitBlocks = this.blocks
      .filter((b) => b.type === "exit" || b.type === "return" || b.type === "throw")
      .map((b) => b.id);

    // If no explicit exit blocks, use blocks with no outgoing edges
    if (exitBlocks.length === 0) {
      const hasOutgoing = new Set(this.edges.map((e) => e.from));
      for (const block of this.blocks) {
        if (!hasOutgoing.has(block.id)) {
          exitBlocks.push(block.id);
        }
      }
    }

    const complexity = calculateCyclomaticComplexity(this.blocks, this.edges);

    return createCFGInfo({
      functionName: this.functionName,
      filePath: this.filePath,
      blocks: this.blocks,
      edges: this.edges,
      entryBlock,
      exitBlocks,
      cyclomaticComplexity: complexity,
      maxNestingDepth: this.maxNestingDepth,
      decisionPoints: this.decisionPoints,
      nestedFunctions: this.nestedFunctions,
    });
  }
}
