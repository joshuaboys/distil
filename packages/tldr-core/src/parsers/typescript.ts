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
  DFGInfo,
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
    this.traverseForCalls(root, null, calls);

    return calls;
  }

  async extractCFG(
    _source: string,
    _functionName: string,
    _filePath: string
  ): Promise<CFGInfo | null> {
    // TODO: Implement CFG extraction
    // This will be implemented in a later phase
    return null;
  }

  async extractDFG(
    _source: string,
    _functionName: string,
    _filePath: string
  ): Promise<DFGInfo | null> {
    // TODO: Implement DFG extraction
    // This will be implemented in a later phase
    return null;
  }

  async extractPDG(
    _source: string,
    _functionName: string,
    _filePath: string
  ): Promise<PDGInfo | null> {
    // TODO: Implement PDG extraction
    // This will be implemented in a later phase
    return null;
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

  private traverseForCalls(
    node: TSNode,
    currentFunction: string | null,
    calls: Map<string, string[]>
  ): void {
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

      if (funcName && !calls.has(funcName)) {
        calls.set(funcName, []);
      }

      // Traverse children with this function as context
      for (const child of node.children) {
        this.traverseForCalls(child, funcName, calls);
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
      this.traverseForCalls(child, currentFunction, calls);
    }
  }
}

/**
 * Create and export singleton parser instance
 */
export const typescriptParser = new TypeScriptParser();
