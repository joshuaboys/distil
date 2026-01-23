/**
 * TypeScript/JavaScript Parser
 *
 * Uses tree-sitter-typescript for parsing TS/JS files.
 * Implements all analysis layers (L1-L5).
 */

import type { LanguageParser } from './base.js';
import type {
  Language,
  ModuleInfo,
  CFGInfo,
  CFGBlock,
  BlockType,
  EdgeType,
  DFGInfo,
  VarRef,
  DefUseEdge,
  RefType,
  PDGInfo,
  FunctionInfo,
  ClassInfo,
  ImportInfo,
  ExportInfo,
  ParameterInfo,
  PropertyInfo,
  DecoratorInfo,
  InterfaceInfo,
  TypeAliasInfo,
  VariableInfo,
  SourceRange,
} from '../types/index.js';
import { createFunctionInfo, createClassInfo } from '../types/ast.js';
import { computeContentHash } from '../types/common.js';
import { createCFGInfo, calculateCyclomaticComplexity } from '../types/cfg.js';
import { createDFGInfo } from '../types/dfg.js';
import { buildPDG } from '../types/pdg.js';

// Tree-sitter types (simplified for compatibility)
interface TSNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  children: TSNode[];
  firstChild: TSNode | null;
  firstNamedChild: TSNode | null;
}

interface TSTree {
  rootNode: TSNode;
}

interface TSParser {
  parse(source: string): TSTree;
  setLanguage(lang: unknown): void;
}

// Tree-sitter imports (dynamic to handle optional dependency)
let ParserClass: (new () => TSParser) | null = null;
let TypeScriptLanguage: unknown = null;
let TSXLanguage: unknown = null;

/**
 * Initialize tree-sitter (lazy loading)
 */
async function initTreeSitter(): Promise<void> {
  if (ParserClass !== null) return;

  try {
    const treeSitter = await import('tree-sitter');
    ParserClass = treeSitter.default as unknown as new () => TSParser;

    const tsLang = await import('tree-sitter-typescript');
    TypeScriptLanguage = (tsLang.default as { typescript: unknown }).typescript;
    TSXLanguage = (tsLang.default as { tsx: unknown }).tsx;
  } catch (error) {
    throw new Error(
      `Failed to load tree-sitter: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * TypeScript/JavaScript parser implementation
 */
export class TypeScriptParser implements LanguageParser {
  readonly language: Language = 'typescript';
  readonly extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;

  private parser: TSParser | null = null;

  canHandle(filePath: string): boolean {
    const ext = filePath.slice(filePath.lastIndexOf('.'));
    return this.extensions.includes(ext as (typeof this.extensions)[number]);
  }

  private async getParser(filePath: string): Promise<TSParser> {
    await initTreeSitter();

    if (!ParserClass) {
      throw new Error('Tree-sitter not initialized');
    }

    if (!this.parser) {
      this.parser = new ParserClass();
    }

    // Choose language based on extension
    const ext = filePath.slice(filePath.lastIndexOf('.'));
    const lang = ext === '.tsx' || ext === '.jsx' ? TSXLanguage : TypeScriptLanguage;
    this.parser.setLanguage(lang);

    return this.parser;
  }

  async extractAST(source: string, filePath: string): Promise<ModuleInfo> {
    const parser = await this.getParser(filePath);
    const tree = parser.parse(source);
    const root = tree.rootNode;

    const functions: FunctionInfo[] = [];
    const classes: ClassInfo[] = [];
    const imports: ImportInfo[] = [];
    const exports: ExportInfo[] = [];
    const interfaces: InterfaceInfo[] = [];
    const typeAliases: TypeAliasInfo[] = [];
    const variables: VariableInfo[] = [];
    let docstring: string | null = null;

    // Get module-level docstring (first comment)
    const firstChild = root.firstChild;
    if (firstChild?.type === 'comment') {
      docstring = this.extractDocstring(firstChild.text);
    }

    // Traverse the AST
    for (const child of root.children) {
      switch (child.type) {
        case 'import_statement':
          imports.push(this.parseImport(child));
          break;

        case 'export_statement':
          this.parseExport(child, exports, functions, classes, variables);
          break;

        case 'function_declaration':
        case 'generator_function_declaration':
          functions.push(this.parseFunction(child, false, false));
          break;

        case 'class_declaration':
          classes.push(this.parseClass(child, false));
          break;

        case 'interface_declaration':
          interfaces.push(this.parseInterface(child));
          break;

        case 'type_alias_declaration':
          typeAliases.push(this.parseTypeAlias(child));
          break;

        case 'lexical_declaration':
        case 'variable_declaration':
          variables.push(...this.parseVariableDeclaration(child, false));
          break;

        case 'expression_statement': {
          // Handle arrow functions assigned to variables at top level
          const expr = child.firstChild;
          if (expr?.type === 'assignment_expression') {
            const fn = this.tryParseArrowFunction(expr, false);
            if (fn) functions.push(fn);
          }
          break;
        }
      }
    }

    const contentHash = await computeContentHash(source);

    const moduleInfo: ModuleInfo = {
      filePath,
      language: this.language,
      docstring,
      imports,
      exports,
      functions,
      classes,
      interfaces,
      typeAliases,
      variables,
      contentHash: contentHash.hash,
      extractedAt: Date.now(),
      toJSON() {
        return {
          filePath: this.filePath,
          language: this.language,
          docstring: this.docstring,
          imports: this.imports,
          exports: this.exports,
          functions: this.functions.map((f) => ({
            name: f.name,
            signature: f.signature(),
            params: f.params,
            returnType: f.returnType,
            isAsync: f.isAsync,
            isExported: f.isExported,
            lineNumber: f.lineNumber,
          })),
          classes: this.classes.map((c) => ({
            name: c.name,
            signature: c.signature(),
            methods: c.methods.map((m) => ({
              name: m.name,
              signature: m.signature(),
            })),
            isExported: c.isExported,
            lineNumber: c.lineNumber,
          })),
          interfaces: this.interfaces,
          typeAliases: this.typeAliases,
          variables: this.variables,
        };
      },
      toCompact() {
        return {
          file: filePath.split('/').pop(),
          functions: this.functions.map((f) => f.signature()),
          classes: this.classes.map((c) => ({
            name: c.name,
            methods: c.methods.map((m) => m.name),
          })),
          imports: this.imports.map((i) => i.module),
        };
      },
    };

    return moduleInfo;
  }

  async extractCalls(
    source: string,
    filePath: string
  ): Promise<Map<string, string[]>> {
    const parser = await this.getParser(filePath);
    const tree = parser.parse(source);
    const root = tree.rootNode;

    const calls = new Map<string, string[]>();

    // Find all function declarations and their calls
    this.traverseForCalls(root, null, calls, null);

    return calls;
  }

  async extractCFG(
    source: string,
    functionName: string,
    filePath: string
  ): Promise<CFGInfo | null> {
    const parser = await this.getParser(filePath);
    const tree = parser.parse(source);
    const root = tree.rootNode;

    // Find the target function
    const funcNode = this.findFunctionNode(root, functionName);
    if (!funcNode) return null;

    // Find the function body
    const bodyNode = this.findFunctionBody(funcNode);
    if (!bodyNode) return null;

    // Build CFG
    const builder = new CFGBuilder(source, filePath, functionName);
    builder.buildFromBody(bodyNode);

    return builder.getCFG();
  }

  async extractDFG(
    source: string,
    functionName: string,
    filePath: string
  ): Promise<DFGInfo | null> {
    const parser = await this.getParser(filePath);
    const tree = parser.parse(source);
    const root = tree.rootNode;

    // Find the target function
    const funcNode = this.findFunctionNode(root, functionName);
    if (!funcNode) return null;

    // Find the function body
    const bodyNode = this.findFunctionBody(funcNode);
    if (!bodyNode) return null;

    // Build DFG
    const builder = new DFGBuilder(filePath, functionName);

    // Extract parameters as initial definitions
    const params = funcNode.children.find((c) => c.type === 'formal_parameters');
    if (params) {
      builder.extractParameters(params);
    }

    // Process the body
    builder.processNode(bodyNode);

    return builder.getDFG();
  }

  async extractPDG(
    source: string,
    functionName: string,
    filePath: string
  ): Promise<PDGInfo | null> {
    // PDG requires both CFG and DFG
    const cfg = await this.extractCFG(source, functionName, filePath);
    if (!cfg) return null;

    const dfg = await this.extractDFG(source, functionName, filePath);
    if (!dfg) return null;

    // Build PDG from CFG and DFG using the existing buildPDG function
    return buildPDG(cfg, dfg);
  }

  // ==================== Private helpers ====================

  private getNodeRange(node: TSNode): SourceRange {
    return {
      start: { line: node.startPosition.row + 1, column: node.startPosition.column },
      end: { line: node.endPosition.row + 1, column: node.endPosition.column },
    };
  }

  private extractDocstring(text: string): string | null {
    // Handle JSDoc comments
    if (text.startsWith('/**')) {
      return text
        .slice(3, -2)
        .split('\n')
        .map((line) => line.replace(/^\s*\*\s?/, ''))
        .join('\n')
        .trim();
    }
    // Handle single-line comments
    if (text.startsWith('//')) {
      return text.slice(2).trim();
    }
    // Handle multi-line comments
    if (text.startsWith('/*')) {
      return text.slice(2, -2).trim();
    }
    return null;
  }

  private parseImport(node: TSNode): ImportInfo {
    const importInfo: ImportInfo = {
      module: '',
      names: [],
      isFrom: true,
      isTypeOnly: false,
      isDynamic: false,
      lineNumber: node.startPosition.row + 1,
    };

    for (const child of node.children) {
      if (child.type === 'string') {
        importInfo.module = child.text.slice(1, -1); // Remove quotes
      } else if (child.type === 'import_clause') {
        this.parseImportClause(child, importInfo);
      } else if (child.type === 'type') {
        importInfo.isTypeOnly = true;
      }
    }

    return importInfo;
  }

  private parseImportClause(node: TSNode, importInfo: ImportInfo): void {
    for (const child of node.children) {
      if (child.type === 'identifier') {
        // Default import
        importInfo.names.push({
          name: 'default',
          alias: child.text,
          isDefault: true,
          isNamespace: false,
          isTypeOnly: false,
        });
      } else if (child.type === 'namespace_import') {
        // import * as x
        const alias = child.firstNamedChild?.text ?? '';
        importInfo.names.push({
          name: '*',
          alias,
          isDefault: false,
          isNamespace: true,
          isTypeOnly: false,
        });
      } else if (child.type === 'named_imports') {
        // import { x, y as z }
        this.parseNamedImports(child, importInfo);
      }
    }
  }

  private parseNamedImports(node: TSNode, importInfo: ImportInfo): void {
    for (const child of node.children) {
      if (child.type === 'import_specifier') {
        const parts = child.children;
        const name = parts[0]?.text ?? '';
        let alias: string | null = null;

        // Check for "as" alias
        for (let i = 0; i < parts.length; i++) {
          if (parts[i]?.text === 'as' && parts[i + 1]) {
            alias = parts[i + 1]?.text ?? null;
            break;
          }
        }

        importInfo.names.push({
          name,
          alias,
          isDefault: false,
          isNamespace: false,
          isTypeOnly: false,
        });
      }
    }
  }

  private parseExport(
    node: TSNode,
    exports: ExportInfo[],
    functions: FunctionInfo[],
    classes: ClassInfo[],
    variables: VariableInfo[]
  ): void {
    const children = node.children;
    let isDefault = false;

    for (const child of children) {
      if (child.type === 'default') {
        isDefault = true;
      } else if (child.type === 'function_declaration' || child.type === 'generator_function_declaration') {
        const fn = this.parseFunction(child, true, isDefault);
        functions.push(fn);
        exports.push({
          name: fn.name,
          localName: null,
          isDefault,
          isReExport: false,
          sourceModule: null,
          isTypeOnly: false,
          lineNumber: fn.lineNumber,
        });
      } else if (child.type === 'class_declaration') {
        const cls = this.parseClass(child, true);
        classes.push(cls);
        exports.push({
          name: cls.name,
          localName: null,
          isDefault,
          isReExport: false,
          sourceModule: null,
          isTypeOnly: false,
          lineNumber: cls.lineNumber,
        });
      } else if (child.type === 'lexical_declaration' || child.type === 'variable_declaration') {
        const vars = this.parseVariableDeclaration(child, true);
        variables.push(...vars);
        for (const v of vars) {
          exports.push({
            name: v.name,
            localName: null,
            isDefault,
            isReExport: false,
            sourceModule: null,
            isTypeOnly: false,
            lineNumber: v.lineNumber,
          });
        }
      }
    }
  }

  private parseFunction(
    node: TSNode,
    isExported: boolean,
    isDefault: boolean
  ): FunctionInfo {
    let name = '';
    let params: ParameterInfo[] = [];
    let returnType: string | null = null;
    const docstring: string | null = null;
    let isAsync = false;
    const isGenerator = node.type === 'generator_function_declaration';
    const decorators: DecoratorInfo[] = [];

    for (const child of node.children) {
      if (child.type === 'async') {
        isAsync = true;
      } else if (child.type === 'identifier') {
        name = child.text;
      } else if (child.type === 'formal_parameters') {
        params = this.parseParameters(child);
      } else if (child.type === 'type_annotation') {
        returnType = child.text.slice(1).trim(); // Remove leading ':'
      }
    }

    return createFunctionInfo({
      name,
      params,
      returnType,
      docstring,
      isMethod: false,
      isAsync,
      isGenerator,
      isExported,
      exportType: isDefault ? 'default' : isExported ? 'named' : 'none',
      decorators,
      lineNumber: node.startPosition.row + 1,
      range: this.getNodeRange(node),
      visibility: null,
      isStatic: false,
    });
  }

  private parseParameters(node: TSNode): ParameterInfo[] {
    const params: ParameterInfo[] = [];

    for (const child of node.children) {
      if (
        child.type === 'required_parameter' ||
        child.type === 'optional_parameter' ||
        child.type === 'rest_parameter'
      ) {
        const param = this.parseParameter(child);
        if (param) params.push(param);
      }
    }

    return params;
  }

  private parseParameter(node: TSNode): ParameterInfo | null {
    let name = '';
    let type: string | null = null;
    let defaultValue: string | null = null;
    const isRest = node.type === 'rest_parameter';
    const isOptional = node.type === 'optional_parameter';

    for (const child of node.children) {
      if (child.type === 'identifier') {
        name = child.text;
      } else if (child.type === 'type_annotation') {
        type = child.text.slice(1).trim();
      } else if (child.type === '=') {
        // Next child is the default value
        const idx = node.children.indexOf(child);
        const nextChild = node.children[idx + 1];
        if (nextChild) {
          defaultValue = nextChild.text;
        }
      }
    }

    if (!name) return null;

    return {
      name,
      type,
      defaultValue,
      isRest,
      isOptional,
    };
  }

  private parseClass(node: TSNode, isExported: boolean): ClassInfo {
    let name = '';
    const bases: string[] = [];
    const implementsList: string[] = [];
    const docstring: string | null = null;
    const methods: FunctionInfo[] = [];
    const properties: PropertyInfo[] = [];
    const decorators: DecoratorInfo[] = [];
    let isAbstract = false;

    for (const child of node.children) {
      if (child.type === 'identifier' || child.type === 'type_identifier') {
        name = child.text;
      } else if (child.type === 'extends_clause') {
        // Parse base classes
        for (const c of child.children) {
          if (c.type === 'identifier' || c.type === 'generic_type') {
            bases.push(c.text);
          }
        }
      } else if (child.type === 'implements_clause') {
        // Parse interfaces
        for (const c of child.children) {
          if (c.type === 'identifier' || c.type === 'generic_type') {
            implementsList.push(c.text);
          }
        }
      } else if (child.type === 'class_body') {
        // Parse members
        this.parseClassBody(child, methods, properties);
      } else if (child.type === 'abstract') {
        isAbstract = true;
      }
    }

    return createClassInfo({
      name,
      bases,
      implements: implementsList,
      docstring,
      methods,
      properties,
      isExported,
      exportType: isExported ? 'named' : 'none',
      isAbstract,
      decorators,
      lineNumber: node.startPosition.row + 1,
      range: this.getNodeRange(node),
    });
  }

  private parseClassBody(
    node: TSNode,
    methods: FunctionInfo[],
    properties: PropertyInfo[]
  ): void {
    for (const child of node.children) {
      if (child.type === 'method_definition') {
        const method = this.parseMethod(child);
        if (method) methods.push(method);
      } else if (
        child.type === 'public_field_definition' ||
        child.type === 'private_field_definition'
      ) {
        const prop = this.parseProperty(child);
        if (prop) properties.push(prop);
      }
    }
  }

  private parseMethod(node: TSNode): FunctionInfo | null {
    let name = '';
    let params: ParameterInfo[] = [];
    let returnType: string | null = null;
    let isAsync = false;
    let isGenerator = false;
    let isStatic = false;
    let visibility: 'public' | 'private' | 'protected' = 'public';
    const decorators: DecoratorInfo[] = [];

    for (const child of node.children) {
      if (child.type === 'async') {
        isAsync = true;
      } else if (child.type === 'static') {
        isStatic = true;
      } else if (child.type === 'property_identifier' || child.type === 'private_property_identifier') {
        name = child.text;
        if (child.type === 'private_property_identifier') {
          visibility = 'private';
        }
      } else if (child.type === 'formal_parameters') {
        params = this.parseParameters(child);
      } else if (child.type === 'type_annotation') {
        returnType = child.text.slice(1).trim();
      } else if (child.type === '*') {
        isGenerator = true;
      } else if (child.type === 'accessibility_modifier') {
        visibility = child.text as 'public' | 'private' | 'protected';
      }
    }

    if (!name) return null;

    return createFunctionInfo({
      name,
      params,
      returnType,
      docstring: null,
      isMethod: true,
      isAsync,
      isGenerator,
      isExported: false,
      exportType: 'none',
      decorators,
      lineNumber: node.startPosition.row + 1,
      range: this.getNodeRange(node),
      visibility,
      isStatic,
    });
  }

  private parseProperty(node: TSNode): PropertyInfo | null {
    let name = '';
    let type: string | null = null;
    let visibility: 'public' | 'private' | 'protected' = 'public';
    let isStatic = false;
    let isReadonly = false;
    let isOptional = false;

    for (const child of node.children) {
      if (child.type === 'property_identifier' || child.type === 'private_property_identifier') {
        name = child.text;
        if (child.type === 'private_property_identifier') {
          visibility = 'private';
        }
      } else if (child.type === 'type_annotation') {
        type = child.text.slice(1).trim();
      } else if (child.type === 'static') {
        isStatic = true;
      } else if (child.type === 'readonly') {
        isReadonly = true;
      } else if (child.type === 'accessibility_modifier') {
        visibility = child.text as 'public' | 'private' | 'protected';
      } else if (child.type === '?') {
        isOptional = true;
      }
    }

    if (!name) return null;

    return {
      name,
      type,
      defaultValue: null,
      visibility,
      isStatic,
      isReadonly,
      isOptional,
      lineNumber: node.startPosition.row + 1,
      decorators: [],
    };
  }

  private parseInterface(node: TSNode): InterfaceInfo {
    let name = '';
    const extendsList: string[] = [];
    const methods: FunctionInfo[] = [];
    const properties: PropertyInfo[] = [];

    for (const child of node.children) {
      if (child.type === 'identifier' || child.type === 'type_identifier') {
        name = child.text;
      }
    }

    return {
      name,
      extends: extendsList,
      docstring: null,
      methods,
      properties,
      isExported: false,
      lineNumber: node.startPosition.row + 1,
      range: this.getNodeRange(node),
    };
  }

  private parseTypeAlias(node: TSNode): TypeAliasInfo {
    let name = '';
    let definition = '';

    for (const child of node.children) {
      if (child.type === 'identifier' || child.type === 'type_identifier') {
        name = child.text;
      } else if (child.type.includes('type')) {
        definition = child.text;
      }
    }

    return {
      name,
      definition,
      isExported: false,
      docstring: null,
      lineNumber: node.startPosition.row + 1,
    };
  }

  private parseVariableDeclaration(
    node: TSNode,
    isExported: boolean
  ): VariableInfo[] {
    const variables: VariableInfo[] = [];

    let kind: 'const' | 'let' | 'var' = 'const';

    for (const child of node.children) {
      if (child.type === 'const' || child.type === 'let' || child.type === 'var') {
        kind = child.type as 'const' | 'let' | 'var';
      } else if (child.type === 'variable_declarator') {
        const varInfo = this.parseVariableDeclarator(child, kind, isExported, node.startPosition.row + 1);
        if (varInfo) variables.push(varInfo);
      }
    }

    return variables;
  }

  private parseVariableDeclarator(
    node: TSNode,
    kind: 'const' | 'let' | 'var',
    isExported: boolean,
    lineNumber: number
  ): VariableInfo | null {
    let name = '';
    let type: string | null = null;

    for (const child of node.children) {
      if (child.type === 'identifier') {
        name = child.text;
      } else if (child.type === 'type_annotation') {
        type = child.text.slice(1).trim();
      }
    }

    if (!name) return null;

    return {
      name,
      kind,
      type,
      isExported,
      lineNumber,
    };
  }

  private tryParseArrowFunction(
    _node: TSNode,
    _isExported: boolean
  ): FunctionInfo | null {
    // TODO: Parse arrow functions assigned to variables
    return null;
  }

  /**
   * Find a function node by name in the AST
   */
  private findFunctionNode(root: TSNode, functionName: string): TSNode | null {
    // Check for Class.method format
    const parts = functionName.split('.');
    if (parts.length === 2) {
      const [className, methodName] = parts;
      return this.findMethodNode(root, className!, methodName!);
    }

    // Find standalone function
    const result = this.searchForFunction(root, functionName);
    return result;
  }

  private searchForFunction(node: TSNode, functionName: string): TSNode | null {
    if (
      node.type === 'function_declaration' ||
      node.type === 'generator_function_declaration'
    ) {
      for (const child of node.children) {
        if (child.type === 'identifier' && child.text === functionName) {
          return node;
        }
      }
    }

    // Check for exported functions
    if (node.type === 'export_statement') {
      for (const child of node.children) {
        if (
          child.type === 'function_declaration' ||
          child.type === 'generator_function_declaration'
        ) {
          const result = this.searchForFunction(child, functionName);
          if (result) return result;
        }
      }
    }

    // Check for arrow functions assigned to variables
    if (node.type === 'lexical_declaration' || node.type === 'variable_declaration') {
      for (const child of node.children) {
        if (child.type === 'variable_declarator') {
          const nameNode = child.children.find((c) => c.type === 'identifier');
          const valueNode = child.children.find((c) => c.type === 'arrow_function');
          if (nameNode?.text === functionName && valueNode) {
            return valueNode;
          }
        }
      }
    }

    // Recurse into children
    for (const child of node.children) {
      const result = this.searchForFunction(child, functionName);
      if (result) return result;
    }

    return null;
  }

  private findMethodNode(
    root: TSNode,
    className: string,
    methodName: string
  ): TSNode | null {
    // Find class
    const classNode = this.findClassNode(root, className);
    if (!classNode) return null;

    // Find class body
    const classBody = classNode.children.find((c) => c.type === 'class_body');
    if (!classBody) return null;

    // Find method
    for (const child of classBody.children) {
      if (child.type === 'method_definition') {
        for (const mc of child.children) {
          if (
            (mc.type === 'property_identifier' || mc.type === 'private_property_identifier') &&
            mc.text === methodName
          ) {
            return child;
          }
        }
      }
    }

    return null;
  }

  private findClassNode(node: TSNode, className: string): TSNode | null {
    if (node.type === 'class_declaration') {
      for (const child of node.children) {
        if (
          (child.type === 'identifier' || child.type === 'type_identifier') &&
          child.text === className
        ) {
          return node;
        }
      }
    }

    // Check exports
    if (node.type === 'export_statement') {
      for (const child of node.children) {
        if (child.type === 'class_declaration') {
          const result = this.findClassNode(child, className);
          if (result) return result;
        }
      }
    }

    for (const child of node.children) {
      const result = this.findClassNode(child, className);
      if (result) return result;
    }

    return null;
  }

  /**
   * Find the body of a function node
   */
  private findFunctionBody(funcNode: TSNode): TSNode | null {
    for (const child of funcNode.children) {
      if (child.type === 'statement_block') {
        return child;
      }
      // Arrow functions might have expression body
      if (
        funcNode.type === 'arrow_function' &&
        child.type !== 'formal_parameters' &&
        child.type !== '=>' &&
        child.type !== 'identifier' &&
        !child.type.includes('parameter')
      ) {
        // Could be an expression body or a block
        if (child.type === 'statement_block') {
          return child;
        }
        // Expression body - wrap in conceptual block
        return child;
      }
    }
    return null;
  }

  private traverseForCalls(
    node: TSNode,
    currentFunction: string | null,
    calls: Map<string, string[]>,
    currentClass: string | null
  ): void {
    if (node.type === 'class_declaration') {
      let className = currentClass;
      for (const child of node.children) {
        if (child.type === 'identifier' || child.type === 'type_identifier') {
          className = child.text;
          break;
        }
      }

      for (const child of node.children) {
        this.traverseForCalls(child, currentFunction, calls, className);
      }
      return;
    }

    // Track current function context
    if (
      node.type === 'function_declaration' ||
      node.type === 'method_definition' ||
      node.type === 'arrow_function'
    ) {
      // Find function name
      let funcName = currentFunction;
      for (const child of node.children) {
        if (child.type === 'identifier' || child.type === 'property_identifier') {
          funcName = child.text;
          break;
        }
      }

      if (funcName) {
        const qualifiedName =
          node.type === 'method_definition' && currentClass
            ? `${currentClass}.${funcName}`
            : funcName;

        if (!calls.has(qualifiedName)) {
          calls.set(qualifiedName, []);
        }

        // Traverse children with this function as context
        for (const child of node.children) {
          this.traverseForCalls(child, qualifiedName, calls, currentClass);
        }
      }
      return;
    }

    // Record function calls
    if (node.type === 'call_expression' && currentFunction) {
      const callee = node.firstNamedChild;
      if (callee) {
        let calleeName = '';
        if (callee.type === 'identifier') {
          calleeName = callee.text;
        } else if (callee.type === 'member_expression') {
          // Get the method name (last part)
          const prop = callee.children.find((c) => c.type === 'property_identifier');
          if (prop) calleeName = prop.text;
        }

        if (calleeName) {
          const existing = calls.get(currentFunction) ?? [];
          if (!existing.includes(calleeName)) {
            existing.push(calleeName);
            calls.set(currentFunction, existing);
          }
        }
      }
    }

    // Continue traversing
    for (const child of node.children) {
      this.traverseForCalls(child, currentFunction, calls, currentClass);
    }
  }
}

/**
 * CFG Builder for TypeScript/JavaScript
 */
class CFGBuilder {
  private filePath: string;
  private functionName: string;
  private blocks: CFGBlock[] = [];
  private edges: Array<{ from: number; to: number; type: EdgeType; condition: string | null; isBackEdge: boolean }> = [];
  private blockId = 0;
  private currentNestingDepth = 0;
  private maxNestingDepth = 0;
  private decisionPoints = 0;
  private nestedFunctions = new Map<string, CFGInfo>();

  constructor(_source: string, filePath: string, functionName: string) {
    void _source; // Unused but kept for API consistency
    this.filePath = filePath;
    this.functionName = functionName;
  }

  buildFromBody(bodyNode: TSNode): void {
    // Create entry block
    const entryBlock = this.createBlock('entry', bodyNode);

    // Process the body
    if (bodyNode.type === 'statement_block') {
      const exitBlocks = this.processStatements(bodyNode.children, [entryBlock.id]);
      // Create exit block and connect
      const exitBlock = this.createBlock('exit', bodyNode);
      for (const blockId of exitBlocks) {
        this.addEdge(blockId, exitBlock.id, 'unconditional');
      }
    } else {
      // Expression body (arrow function)
      const exprBlock = this.createBlock('return', bodyNode);
      exprBlock.statements = [this.getNodeText(bodyNode)];
      this.extractVarsFromNode(bodyNode, exprBlock);
      this.addEdge(entryBlock.id, exprBlock.id, 'unconditional');

      const exitBlock = this.createBlock('exit', bodyNode);
      this.addEdge(exprBlock.id, exitBlock.id, 'return');
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
    return (
      node.type === '{' ||
      node.type === '}' ||
      node.type === ';' ||
      node.type === 'comment'
    );
  }

  private processStatement(node: TSNode, predecessors: number[]): number[] {
    switch (node.type) {
      case 'if_statement':
        return this.processIfStatement(node, predecessors);

      case 'for_statement':
      case 'for_in_statement':
      case 'for_of_statement':
        return this.processForStatement(node, predecessors);

      case 'while_statement':
        return this.processWhileStatement(node, predecessors);

      case 'do_statement':
        return this.processDoWhileStatement(node, predecessors);

      case 'switch_statement':
        return this.processSwitchStatement(node, predecessors);

      case 'try_statement':
        return this.processTryStatement(node, predecessors);

      case 'return_statement':
        return this.processReturnStatement(node, predecessors);

      case 'throw_statement':
        return this.processThrowStatement(node, predecessors);

      case 'break_statement':
      case 'continue_statement':
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
    const branchBlock = this.createBlock('branch', node);
    const condition = node.children.find((c) => c.type === 'parenthesized_expression');
    if (condition) {
      branchBlock.statements = [this.getNodeText(condition)];
      this.extractVarsFromNode(condition, branchBlock);
    }

    // Connect predecessors to branch
    for (const predId of predecessors) {
      this.addEdge(predId, branchBlock.id, 'unconditional');
    }

    const exitBlocks: number[] = [];

    // Process consequence (then branch)
    const consequence = node.children.find(
      (c) => c.type === 'statement_block' || (c.type !== 'parenthesized_expression' && c.type !== 'else_clause' && c.type !== 'if' && c.type !== '(' && c.type !== ')')
    );
    if (consequence) {
      const thenEntry = this.createBlock('body', consequence);
      this.addEdge(branchBlock.id, thenEntry.id, 'true', this.getConditionText(condition));

      let thenExits: number[];
      if (consequence.type === 'statement_block') {
        thenExits = this.processStatements(consequence.children, [thenEntry.id]);
      } else {
        thenEntry.statements = [this.getNodeText(consequence)];
        this.extractVarsFromNode(consequence, thenEntry);
        thenExits = [thenEntry.id];
      }
      exitBlocks.push(...thenExits);
    }

    // Process alternative (else branch)
    const elseClause = node.children.find((c) => c.type === 'else_clause');
    if (elseClause) {
      const elseBody = elseClause.children.find(
        (c) => c.type === 'statement_block' || c.type === 'if_statement' || c.type !== 'else'
      );
      if (elseBody) {
        if (elseBody.type === 'if_statement') {
          // else if - recurse
          const elseIfExits = this.processIfStatement(elseBody, [branchBlock.id]);
          // The edge to else-if is 'false' from this branch
          // Need to find the first block of else-if and update the edge
          exitBlocks.push(...elseIfExits);
        } else {
          const elseEntry = this.createBlock('body', elseBody);
          this.addEdge(branchBlock.id, elseEntry.id, 'false', `!(${this.getConditionText(condition)})`);

          let elseExits: number[];
          if (elseBody.type === 'statement_block') {
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
    const headerBlock = this.createBlock('loop_header', node);

    // Extract init, condition, update for for-loops
    let initNode: TSNode | null = null;
    let condNode: TSNode | null = null;
    let body: TSNode | null = null;

    if (node.type === 'for_statement') {
      // for (init; cond; update) body
      let foundFirstSemi = false;
      for (const child of node.children) {
        if (child.type === ';') {
          foundFirstSemi = true;
          continue;
        }
        if (!foundFirstSemi && child.type !== 'for' && child.type !== '(') {
          initNode = child;
        } else if (foundFirstSemi && !condNode && child.type !== ')') {
          condNode = child;
        }
        if (child.type === 'statement_block') {
          body = child;
        }
      }
    } else {
      // for-in / for-of
      condNode = node.children.find(
        (c) => c.type !== 'for' && c.type !== '(' && c.type !== ')' && c.type !== 'statement_block'
      ) ?? null;
      body = node.children.find((c) => c.type === 'statement_block') ?? null;
    }

    if (initNode) {
      headerBlock.statements.push(this.getNodeText(initNode));
      this.extractVarsFromNode(initNode, headerBlock);
    }
    if (condNode) {
      headerBlock.statements.push(this.getNodeText(condNode));
      this.extractVarsFromNode(condNode, headerBlock);
    }

    // Connect predecessors to header
    for (const predId of predecessors) {
      this.addEdge(predId, headerBlock.id, 'unconditional');
    }

    // Process body
    const exitBlocks: number[] = [];
    if (body) {
      const bodyEntry = this.createBlock('loop_body', body);
      this.addEdge(headerBlock.id, bodyEntry.id, 'true', this.getNodeText(condNode));

      const bodyExits = this.processStatements(body.children, [bodyEntry.id]);

      // Back edge to header
      for (const exitId of bodyExits) {
        this.addEdge(exitId, headerBlock.id, 'back_edge', null, true);
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

    const headerBlock = this.createBlock('loop_header', node);
    const condition = node.children.find((c) => c.type === 'parenthesized_expression');
    if (condition) {
      headerBlock.statements = [this.getNodeText(condition)];
      this.extractVarsFromNode(condition, headerBlock);
    }

    for (const predId of predecessors) {
      this.addEdge(predId, headerBlock.id, 'unconditional');
    }

    const body = node.children.find((c) => c.type === 'statement_block');
    if (body) {
      const bodyEntry = this.createBlock('loop_body', body);
      this.addEdge(headerBlock.id, bodyEntry.id, 'true', this.getConditionText(condition));

      const bodyExits = this.processStatements(body.children, [bodyEntry.id]);
      for (const exitId of bodyExits) {
        this.addEdge(exitId, headerBlock.id, 'back_edge', null, true);
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
    const body = node.children.find((c) => c.type === 'statement_block');
    const bodyEntry = this.createBlock('loop_body', body ?? node);

    for (const predId of predecessors) {
      this.addEdge(predId, bodyEntry.id, 'unconditional');
    }

    let bodyExits: number[] = [bodyEntry.id];
    if (body) {
      bodyExits = this.processStatements(body.children, [bodyEntry.id]);
    }

    // Then check condition
    const condition = node.children.find((c) => c.type === 'parenthesized_expression');
    const headerBlock = this.createBlock('loop_header', node);
    if (condition) {
      headerBlock.statements = [this.getNodeText(condition)];
      this.extractVarsFromNode(condition, headerBlock);
    }

    for (const exitId of bodyExits) {
      this.addEdge(exitId, headerBlock.id, 'unconditional');
    }

    // Back edge to body
    this.addEdge(headerBlock.id, bodyEntry.id, 'back_edge', this.getConditionText(condition), true);

    this.currentNestingDepth--;
    return [headerBlock.id];
  }

  private processSwitchStatement(node: TSNode, predecessors: number[]): number[] {
    this.currentNestingDepth++;
    this.maxNestingDepth = Math.max(this.maxNestingDepth, this.currentNestingDepth);

    const branchBlock = this.createBlock('branch', node);
    const value = node.children.find((c) => c.type === 'parenthesized_expression');
    if (value) {
      branchBlock.statements = [this.getNodeText(value)];
      this.extractVarsFromNode(value, branchBlock);
    }

    for (const predId of predecessors) {
      this.addEdge(predId, branchBlock.id, 'unconditional');
    }

    const switchBody = node.children.find((c) => c.type === 'switch_body');
    const exitBlocks: number[] = [];

    if (switchBody) {
      let prevCaseExits: number[] = [];

      for (const child of switchBody.children) {
        if (child.type === 'switch_case' || child.type === 'switch_default') {
          this.decisionPoints++;

          const isDefault = child.type === 'switch_default';
          const caseBlock = this.createBlock('body', child);

          // Edge from branch to case
          const caseLabel = isDefault
            ? 'default'
            : child.children.find((c) => c.type !== 'case' && c.type !== ':')?.text ?? 'case';
          this.addEdge(
            branchBlock.id,
            caseBlock.id,
            isDefault ? 'default' : 'case',
            caseLabel
          );

          // Fallthrough from previous case
          for (const prevId of prevCaseExits) {
            this.addEdge(prevId, caseBlock.id, 'fallthrough');
          }

          // Process case statements
          const stmts = child.children.filter(
            (c) => c.type !== 'case' && c.type !== 'default' && c.type !== ':'
          );
          if (stmts.length > 0) {
            caseBlock.statements = stmts.map((s) => this.getNodeText(s));
            for (const stmt of stmts) {
              this.extractVarsFromNode(stmt, caseBlock);
            }
          }

          // Check for break
          const hasBreak = stmts.some((s) => s.type === 'break_statement');
          if (hasBreak) {
            exitBlocks.push(caseBlock.id);
            prevCaseExits = [];
          } else {
            prevCaseExits = [caseBlock.id];
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
    const tryBody = node.children.find((c) => c.type === 'statement_block');
    if (tryBody) {
      const tryBlock = this.createBlock('try', tryBody);
      for (const predId of predecessors) {
        this.addEdge(predId, tryBlock.id, 'unconditional');
      }

      const tryExits = this.processStatements(tryBody.children, [tryBlock.id]);
      exitBlocks.push(...tryExits);
    }

    // Catch clause
    const catchClause = node.children.find((c) => c.type === 'catch_clause');
    if (catchClause) {
      const catchBody = catchClause.children.find((c) => c.type === 'statement_block');
      if (catchBody) {
        const catchBlock = this.createBlock('catch', catchBody);
        // Exception edge from try
        if (tryBody) {
          const tryBlockId = this.blocks.find((b) => b.type === 'try')?.id;
          if (tryBlockId !== undefined) {
            this.addEdge(tryBlockId, catchBlock.id, 'throw');
          }
        }
        const catchExits = this.processStatements(catchBody.children, [catchBlock.id]);
        exitBlocks.push(...catchExits);
      }
    }

    // Finally clause
    const finallyClause = node.children.find((c) => c.type === 'finally_clause');
    if (finallyClause) {
      const finallyBody = finallyClause.children.find((c) => c.type === 'statement_block');
      if (finallyBody) {
        const finallyBlock = this.createBlock('finally', finallyBody);
        // Connect all exits to finally
        const currentExits = [...exitBlocks];
        exitBlocks.length = 0;

        for (const exitId of currentExits) {
          this.addEdge(exitId, finallyBlock.id, 'unconditional');
        }

        const finallyExits = this.processStatements(finallyBody.children, [finallyBlock.id]);
        exitBlocks.push(...finallyExits);
      }
    }

    this.currentNestingDepth--;
    return exitBlocks;
  }

  private processReturnStatement(node: TSNode, predecessors: number[]): number[] {
    const returnBlock = this.createBlock('return', node);
    returnBlock.statements = [this.getNodeText(node)];
    this.extractVarsFromNode(node, returnBlock);

    for (const predId of predecessors) {
      this.addEdge(predId, returnBlock.id, 'unconditional');
    }

    // Return doesn't flow to next statement
    return [];
  }

  private processThrowStatement(node: TSNode, predecessors: number[]): number[] {
    const throwBlock = this.createBlock('throw', node);
    throwBlock.statements = [this.getNodeText(node)];
    this.extractVarsFromNode(node, throwBlock);

    for (const predId of predecessors) {
      this.addEdge(predId, throwBlock.id, 'unconditional');
    }

    // Throw doesn't flow to next statement
    return [];
  }

  private processBreakContinue(node: TSNode, predecessors: number[]): number[] {
    const blockType = node.type === 'break_statement' ? 'body' : 'body';
    const block = this.createBlock(blockType, node);
    block.statements = [this.getNodeText(node)];

    for (const predId of predecessors) {
      this.addEdge(predId, block.id, 'unconditional');
    }

    // These don't flow normally - handled by loop/switch context
    return [];
  }

  private processBasicStatement(node: TSNode, predecessors: number[]): number[] {
    const block = this.createBlock('body', node);
    block.statements = [this.getNodeText(node)];
    this.extractVarsFromNode(node, block);

    for (const predId of predecessors) {
      this.addEdge(predId, block.id, 'unconditional');
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
    isBackEdge: boolean = false
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
    if (!node) return '';
    return node.text.trim();
  }

  private getConditionText(node: TSNode | null | undefined): string {
    if (!node) return '';
    // Remove outer parens
    let text = node.text.trim();
    if (text.startsWith('(') && text.endsWith(')')) {
      text = text.slice(1, -1);
    }
    return text;
  }

  private extractVarsFromNode(node: TSNode, block: CFGBlock): void {
    this.traverseForVars(node, block);
  }

  private traverseForVars(node: TSNode, block: CFGBlock): void {
    // Check for assignments (defines)
    if (node.type === 'assignment_expression') {
      const left = node.children[0];
      if (left?.type === 'identifier') {
        if (!block.defines.includes(left.text)) {
          block.defines.push(left.text);
        }
      }
    }

    // Check for variable declarations (defines)
    if (node.type === 'variable_declarator') {
      const nameNode = node.children.find((c) => c.type === 'identifier');
      if (nameNode && !block.defines.includes(nameNode.text)) {
        block.defines.push(nameNode.text);
      }
    }

    // Check for identifiers (uses) - but not in definition position
    if (node.type === 'identifier') {
      const parent = this.getParentType(node);
      if (
        parent !== 'variable_declarator' &&
        parent !== 'function_declaration' &&
        parent !== 'method_definition'
      ) {
        if (!block.uses.includes(node.text) && !block.defines.includes(node.text)) {
          block.uses.push(node.text);
        }
      }
    }

    // Check for function calls
    if (node.type === 'call_expression') {
      const callee = node.firstChild;
      if (callee) {
        let calleeName = '';
        if (callee.type === 'identifier') {
          calleeName = callee.text;
        } else if (callee.type === 'member_expression') {
          const prop = callee.children.find((c) => c.type === 'property_identifier');
          if (prop) calleeName = prop.text;
        }
        if (calleeName && !block.calls.includes(calleeName)) {
          block.calls.push(calleeName);
        }
      }
    }

    // Recurse
    for (const child of node.children) {
      this.traverseForVars(child, block);
    }
  }

  private getParentType(_node: TSNode): string {
    // Note: tree-sitter nodes don't have direct parent access in our interface
    // This is a simplification
    return '';
  }

  getCFG(): CFGInfo {
    const entryBlock = this.blocks.find((b) => b.type === 'entry')?.id ?? 0;
    const exitBlocks = this.blocks
      .filter((b) => b.type === 'exit' || b.type === 'return' || b.type === 'throw')
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

/**
 * DFG Builder for TypeScript/JavaScript
 */
class DFGBuilder {
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
        child.type === 'required_parameter' ||
        child.type === 'optional_parameter' ||
        child.type === 'rest_parameter'
      ) {
        const nameNode = child.children.find((c) => c.type === 'identifier');
        if (nameNode) {
          const ref = this.createRef(nameNode, 'param');
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
      case 'lexical_declaration':
      case 'variable_declaration':
        this.processVariableDeclaration(node);
        break;

      case 'assignment_expression':
        this.processAssignment(node);
        break;

      case 'update_expression':
        this.processUpdate(node);
        break;

      case 'identifier':
        // Only process as use if not in definition position
        if (!inAssignmentLHS) {
          this.processIdentifier(node, 'use');
        }
        break;

      case 'return_statement':
        this.processReturn(node);
        break;

      case 'arrow_function':
      case 'function_expression':
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
      if (child.type === 'variable_declarator') {
        const nameNode = child.children.find((c) => c.type === 'identifier');
        const valueNode = child.children.find(
          (c) =>
            c.type !== 'identifier' &&
            c.type !== '=' &&
            c.type !== 'type_annotation'
        );

        if (nameNode) {
          const ref = this.createRef(nameNode, 'def');
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
    if (left?.type === 'identifier') {
      const ref = this.createRef(left, 'def');
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
    const operand = node.children.find((c) => c.type === 'identifier');
    if (operand) {
      const ref = this.createRef(operand, 'update');
      this.addDefinition(operand.text, ref);
    }
  }

  private processIdentifier(node: TSNode, type: RefType): void {
    // Skip keywords and built-ins
    const builtins = new Set([
      'true', 'false', 'null', 'undefined', 'this', 'super',
      'console', 'Math', 'Object', 'Array', 'String', 'Number',
      'Boolean', 'Error', 'Promise', 'JSON', 'Date', 'RegExp',
    ]);

    if (builtins.has(node.text)) return;

    const ref = this.createRef(node, type);
    this.refs.push(ref);
    this.variables.add(node.text);
  }

  private processReturn(node: TSNode): void {
    // Process return value for uses
    for (const child of node.children) {
      if (child.type !== 'return') {
        this.traverse(child, false);

        // Track what variables are returned
        if (child.type === 'identifier') {
          const ref = this.createRef(child, 'use');
          this.returns.push(ref);
        }
      }
    }
  }

  private processNestedFunction(node: TSNode): void {
    // Find identifiers that are captures (used but not defined in nested scope)
    const nestedVars = new Set<string>();
    const nestedDefs = new Set<string>();

    const collectVars = (n: TSNode): void => {
      if (n.type === 'identifier') {
        nestedVars.add(n.text);
      }
      if (n.type === 'variable_declarator') {
        const nameNode = n.children.find((c) => c.type === 'identifier');
        if (nameNode) nestedDefs.add(nameNode.text);
      }
      if (n.type === 'formal_parameters') {
        for (const c of n.children) {
          const nameNode = c.children?.find((cc) => cc.type === 'identifier');
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
          type: 'capture',
          line: node.startPosition.row + 1,
          column: node.startPosition.column,
          location: {
            line: node.startPosition.row + 1,
            column: node.startPosition.column,
          },
          scope: this.currentScope,
          isInClosure: true,
          expression: 'closure capture',
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
    // For each use, find reaching definitions
    const uses = this.refs.filter(
      (r) => r.type === 'use' || r.type === 'update' || r.type === 'capture'
    );

    for (const use of uses) {
      const defs = this.defMap.get(use.name) ?? [];

      // Find definitions that could reach this use
      // Simple heuristic: definitions before the use line
      const reachingDefs = defs.filter((d) => d.line <= use.line);

      for (const def of reachingDefs) {
        // Check if there's an intervening definition
        const hasIntervening = defs.some(
          (d) => d.line > def.line && d.line < use.line
        );

        const edge: DefUseEdge = {
          variable: use.name,
          def,
          use,
          isMayReach: hasIntervening,
          hasInterveningDef: hasIntervening,
        };
        this.edges.push(edge);
      }
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

/**
 * Create and export singleton parser instance
 */
export const typescriptParser = new TypeScriptParser();
