/**
 * L1: AST Types
 *
 * Types for abstract syntax tree extraction:
 * - Functions and methods
 * - Classes and interfaces
 * - Imports and exports
 * - Module structure
 */

import type { Language, SourceRange } from './common.js';

/**
 * Parameter information for functions/methods
 */
export interface ParameterInfo {
  /** Parameter name */
  name: string;
  /** Type annotation (if present) */
  type: string | null;
  /** Default value expression (if present) */
  defaultValue: string | null;
  /** Is rest parameter (...args) */
  isRest: boolean;
  /** Is optional (?) */
  isOptional: boolean;
}

/**
 * Decorator/attribute information
 */
export interface DecoratorInfo {
  /** Decorator name */
  name: string;
  /** Arguments (if any) */
  arguments: string[];
  /** Source range */
  range: SourceRange;
}

/**
 * Function or method information
 */
export interface FunctionInfo {
  /** Function name */
  name: string;
  /** Parameters with types */
  params: ParameterInfo[];
  /** Return type annotation (if present) */
  returnType: string | null;
  /** Docstring/JSDoc comment */
  docstring: string | null;
  /** Is this a method (vs standalone function) */
  isMethod: boolean;
  /** Is async function */
  isAsync: boolean;
  /** Is generator function */
  isGenerator: boolean;
  /** Is exported */
  isExported: boolean;
  /** Export type (named, default, none) */
  exportType: 'named' | 'default' | 'none';
  /** Decorators/attributes */
  decorators: DecoratorInfo[];
  /** Line number (1-based) */
  lineNumber: number;
  /** Source range */
  range: SourceRange;
  /** Visibility (for class methods) */
  visibility: 'public' | 'private' | 'protected' | null;
  /** Is static (for class methods) */
  isStatic: boolean;

  /**
   * Generate signature string
   */
  signature(): string;
}

/**
 * Property information for classes
 */
export interface PropertyInfo {
  /** Property name */
  name: string;
  /** Type annotation */
  type: string | null;
  /** Default value */
  defaultValue: string | null;
  /** Visibility */
  visibility: 'public' | 'private' | 'protected';
  /** Is static */
  isStatic: boolean;
  /** Is readonly */
  isReadonly: boolean;
  /** Is optional */
  isOptional: boolean;
  /** Line number */
  lineNumber: number;
  /** Decorators */
  decorators: DecoratorInfo[];
}

/**
 * Class information
 */
export interface ClassInfo {
  /** Class name */
  name: string;
  /** Base classes/extended classes */
  bases: string[];
  /** Implemented interfaces */
  implements: string[];
  /** Class-level docstring */
  docstring: string | null;
  /** Methods */
  methods: FunctionInfo[];
  /** Properties */
  properties: PropertyInfo[];
  /** Is exported */
  isExported: boolean;
  /** Export type */
  exportType: 'named' | 'default' | 'none';
  /** Is abstract */
  isAbstract: boolean;
  /** Decorators */
  decorators: DecoratorInfo[];
  /** Line number */
  lineNumber: number;
  /** Source range */
  range: SourceRange;

  /**
   * Generate signature string
   */
  signature(): string;
}

/**
 * Interface information (TypeScript)
 */
export interface InterfaceInfo {
  /** Interface name */
  name: string;
  /** Extended interfaces */
  extends: string[];
  /** Interface docstring */
  docstring: string | null;
  /** Method signatures */
  methods: FunctionInfo[];
  /** Property signatures */
  properties: PropertyInfo[];
  /** Is exported */
  isExported: boolean;
  /** Line number */
  lineNumber: number;
  /** Source range */
  range: SourceRange;
}

/**
 * Type alias information
 */
export interface TypeAliasInfo {
  /** Type name */
  name: string;
  /** Type definition */
  definition: string;
  /** Is exported */
  isExported: boolean;
  /** Docstring */
  docstring: string | null;
  /** Line number */
  lineNumber: number;
}

/**
 * Import information
 */
export interface ImportInfo {
  /** Module specifier (path or package name) */
  module: string;
  /** Imported names (empty for namespace/default imports) */
  names: ImportedName[];
  /** Is "from" import (vs plain import) */
  isFrom: boolean;
  /** Is type-only import */
  isTypeOnly: boolean;
  /** Is dynamic import */
  isDynamic: boolean;
  /** Line number */
  lineNumber: number;
}

/**
 * Individual imported name
 */
export interface ImportedName {
  /** Original name in the module */
  name: string;
  /** Alias (if renamed: import { x as y }) */
  alias: string | null;
  /** Is default import */
  isDefault: boolean;
  /** Is namespace import (* as x) */
  isNamespace: boolean;
  /** Is type-only */
  isTypeOnly: boolean;
}

/**
 * Export information
 */
export interface ExportInfo {
  /** Exported name */
  name: string;
  /** Local name (if different) */
  localName: string | null;
  /** Is default export */
  isDefault: boolean;
  /** Is re-export (export { x } from 'y') */
  isReExport: boolean;
  /** Re-export source module */
  sourceModule: string | null;
  /** Is type-only export */
  isTypeOnly: boolean;
  /** Line number */
  lineNumber: number;
}

/**
 * Variable declaration information
 */
export interface VariableInfo {
  /** Variable name */
  name: string;
  /** Declaration kind (const, let, var) */
  kind: 'const' | 'let' | 'var';
  /** Type annotation */
  type: string | null;
  /** Is exported */
  isExported: boolean;
  /** Line number */
  lineNumber: number;
}

/**
 * Complete module/file analysis result (L1)
 */
export interface ModuleInfo {
  /** Absolute file path */
  filePath: string;
  /** Detected language */
  language: Language;
  /** Module-level docstring */
  docstring: string | null;
  /** All imports */
  imports: ImportInfo[];
  /** All exports */
  exports: ExportInfo[];
  /** Top-level functions */
  functions: FunctionInfo[];
  /** All classes */
  classes: ClassInfo[];
  /** All interfaces (TypeScript) */
  interfaces: InterfaceInfo[];
  /** Type aliases */
  typeAliases: TypeAliasInfo[];
  /** Top-level variables */
  variables: VariableInfo[];
  /** Content hash for dirty detection */
  contentHash: string;
  /** Extraction timestamp */
  extractedAt: number;

  /**
   * Convert to JSON-serializable object
   */
  toJSON(): Record<string, unknown>;

  /**
   * Convert to compact LLM-friendly format
   */
  toCompact(): Record<string, unknown>;
}

/**
 * Create a FunctionInfo with signature method
 */
export function createFunctionInfo(
  data: Omit<FunctionInfo, 'signature'>
): FunctionInfo {
  return {
    ...data,
    signature(): string {
      const asyncPrefix = this.isAsync ? 'async ' : '';
      const generatorPrefix = this.isGenerator ? '*' : '';
      const params = this.params
        .map((p) => {
          let param = p.name;
          if (p.isRest) param = `...${param}`;
          if (p.type) param += `: ${p.type}`;
          if (p.isOptional && !p.type?.includes('undefined')) param += '?';
          if (p.defaultValue) param += ` = ${p.defaultValue}`;
          return param;
        })
        .join(', ');
      const ret = this.returnType ? `: ${this.returnType}` : '';
      return `${asyncPrefix}function${generatorPrefix} ${this.name}(${params})${ret}`;
    },
  };
}

/**
 * Create a ClassInfo with signature method
 */
export function createClassInfo(
  data: Omit<ClassInfo, 'signature'>
): ClassInfo {
  return {
    ...data,
    signature(): string {
      const abstract = this.isAbstract ? 'abstract ' : '';
      const bases =
        this.bases.length > 0 ? ` extends ${this.bases.join(', ')}` : '';
      const impl =
        this.implements.length > 0
          ? ` implements ${this.implements.join(', ')}`
          : '';
      return `${abstract}class ${this.name}${bases}${impl}`;
    },
  };
}
