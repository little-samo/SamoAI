import { type ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Basic JSON Schema type definition to avoid 'any'
 */
interface JsonSchemaNode {
  type?: string | string[];
  $ref?: string;
  $schema?: string;
  $defs?: Record<string, JsonSchemaNode>;
  definitions?: Record<string, JsonSchemaNode>;
  nullable?: boolean;
  tsEnumNames?: string[];
  enumDescriptions?: string[];
  examples?: unknown[];
  [key: string]: unknown;
}

/**
 * Converts a Zod schema to an LLM-friendly JSON schema string.
 *
 * This function takes a Zod schema, converts it to a JSON schema using `zodToJsonSchema`,
 * simplifies it by removing the top-level `$schema` property (which is often
 * unnecessary for an LLM's interpretation of the structure), and then returns
 * the schema as a compact, single-line JSON string.
 *
 * @param schema The Zod schema (ZodTypeAny) to convert.
 * @returns A single-line string representation of the simplified, LLM-optimized JSON schema.
 */
export function zodSchemaToLlmFriendlyString(schema: ZodTypeAny): string {
  // 1. Convert the Zod schema to a raw JSON schema.
  const jsonSchema = zodToJsonSchema(schema) as JsonSchemaNode;

  // 2. Top-level cleanup.
  delete jsonSchema.$schema; // meta URI is unnecessary for LLMs

  // 3. Inline definitions inside `$defs` (latest spec) or `definitions` (legacy).
  inlineDefinitions(jsonSchema, '$defs');
  inlineDefinitions(jsonSchema, 'definitions');

  // 4. Traverse and simplify nodes.
  traverse(jsonSchema, (node) => {
    // Remove TypeScript-specific enum metadata and other unused props.
    delete node.tsEnumNames;
    delete node.enumDescriptions;
    delete node.examples;

    // Remove additional verbose metadata that LLMs typically don't need.
    const dropKeys = [
      'title',
      'default',
      '$comment',
      'format',
      'pattern',
    ] as const;
    dropKeys.forEach((k) => {
      delete (node as Record<string, unknown>)[k];
    });

    // ["T", "null"]  →  { type: "T", nullable: true }
    if (Array.isArray(node.type) && node.type.includes('null')) {
      node.nullable = true;
      node.type = node.type.find((t) => t !== 'null');
    }
  });

  // 5. Stringify without whitespace (single-line).
  return JSON.stringify(jsonSchema);
}

/* ------------------------------------------------------------------ */
/* Helper utilities                                                   */
/* ------------------------------------------------------------------ */

// Recursively traverse every object/array node and execute callback.
function traverse(
  node: unknown,
  fn: (n: JsonSchemaNode) => void,
  seen: WeakSet<object> = new WeakSet()
): void {
  if (!node || typeof node !== 'object') return;
  if (seen.has(node as object)) return; // Prevent infinite recursion on circular refs
  seen.add(node as object);

  fn(node as JsonSchemaNode);

  if (Array.isArray(node)) {
    node.forEach((child) => traverse(child, fn, seen));
  } else {
    Object.values(node).forEach((child) => traverse(child, fn, seen));
  }
}

// Inline every $ref that matches a definition under the given key (e.g. $defs).
function inlineDefinitions(
  root: JsonSchemaNode,
  key: '$defs' | 'definitions'
): void {
  if (!root || !root[key]) return;

  const defs = root[key] as Record<string, JsonSchemaNode>;
  Object.entries(defs).forEach(([defName, defValue]) => {
    const refPath = `#/${key}/${defName}`;
    replaceRefWithDef(root, refPath, defValue);
  });
  delete root[key];
}

// Replace any node whose `$ref` equals `refPath` with `def`.
function replaceRefWithDef(
  node: JsonSchemaNode,
  refPath: string,
  def: JsonSchemaNode
): void {
  traverse(node, (n) => {
    if (n.$ref === refPath) {
      Object.assign(n, def);
      delete n.$ref;
    }
  });
}
