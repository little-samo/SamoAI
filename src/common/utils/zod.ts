import { z, type ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import type { JSONSchema7, JSONSchema7Definition } from 'json-schema';

/* ---------- 0. Constants & Helpers ------------------------ */

// Core JSON Schema keys that we preserve during pruning
const CORE_KEYS = new Set<keyof JSONSchema7>([
  'type',
  'description',
  'pattern',
  'enum',
  'const',
  'properties',
  'items',
  'required',
  'minItems',
  'maxItems',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'anyOf',
  'oneOf',
  'allOf',
]);

// Recursion safety limit
const MAX_DEPTH = 5;

function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${x as string}`);
}

function isSchemaObject(
  def: JSONSchema7Definition | MCPJsonSchema | undefined
): def is MCPJsonSchema {
  return typeof def === 'object' && def !== null;
}

/* ---------- 1. Zod → LLM friendly String -------------------- */

/**
 * Converts a Zod schema to an LLM-friendly JSON string by pruning non-essential properties
 */
function prune(schema: JSONSchema7, depth: number = MAX_DEPTH): unknown {
  if (depth <= 0 || typeof schema !== 'object' || schema === null)
    return schema;
  const dst: Record<string, unknown> = {};

  for (const [k, v] of Object.entries(schema)) {
    if (!CORE_KEYS.has(k as keyof JSONSchema7)) continue;

    switch (k) {
      case 'properties': {
        const cleaned: Record<string, unknown> = {};
        for (const [prop, child] of Object.entries(
          v as Record<string, JSONSchema7>
        )) {
          cleaned[prop] = prune(child, depth - 1);
        }
        dst.properties = cleaned;
        break;
      }
      case 'items': {
        dst.items = Array.isArray(v)
          ? (v as JSONSchema7[]).map((s) => prune(s, depth - 1))
          : prune(v as JSONSchema7, depth - 1);
        break;
      }
      case 'anyOf':
      case 'oneOf':
      case 'allOf': {
        dst[k] = (v as JSONSchema7[]).map((s) => prune(s, depth - 1));
        break;
      }
      default:
        dst[k] = v;
    }
  }

  // Remove empty required array
  if (Array.isArray(dst.required) && dst.required.length === 0)
    delete dst.required;

  return dst;
}

export function zodSchemaToLlmFriendlyString(schema: ZodTypeAny): string {
  const draft = zodToJsonSchema(schema) as JSONSchema7;

  // Remove metadata that's not useful for LLMs
  delete draft.$schema;
  delete draft.$id;
  delete draft.title;
  delete draft.default;
  delete draft.examples;

  return JSON.stringify(prune(draft));
}

/* ---------- 2. MCP Draft-07 subset  →  Zod ------------------ */

// MCP JSON Schema type (Draft-07 subset with extensions)
export type MCPJsonSchema = JSONSchema7 & {
  nullable?: boolean;
  discriminator?: unknown; // Not handled in this implementation
};

/**
 * Converts MCP JSON Schema to Zod schema with recursion safety
 */
function toZod(schema: MCPJsonSchema, depth: number = MAX_DEPTH): ZodTypeAny {
  if (depth <= 0) return z.any();

  // Handle const values
  if ('const' in schema) {
    return z.literal(schema.const as string | number | boolean | null);
  }

  // Handle enum values
  if (schema.enum) {
    if (schema.enum.length === 1) {
      return z.literal(schema.enum[0] as string | number | boolean | null);
    }

    // Handle string enums with z.enum for better type safety
    if (schema.enum.every((e) => typeof e === 'string')) {
      return z.enum(schema.enum as [string, ...string[]]);
    }

    // Handle mixed enums with union of literals
    const literals = schema.enum
      .filter(
        (e): e is string | number | boolean | null =>
          typeof e === 'string' ||
          typeof e === 'number' ||
          typeof e === 'boolean' ||
          e === null
      )
      .map((e) => z.literal(e));

    if (literals.length >= 2) {
      return z.union([literals[0], literals[1], ...literals.slice(2)]);
    } else if (literals.length === 1) {
      return literals[0];
    }
  }

  // Handle composition schemas
  if (schema.anyOf) {
    const schemas = schema.anyOf
      .filter(isSchemaObject)
      .map((s) => toZod(s, depth - 1));
    if (schemas.length >= 2) {
      return z.union([schemas[0], schemas[1], ...schemas.slice(2)]);
    } else if (schemas.length === 1) {
      return schemas[0];
    }
  }

  if (schema.oneOf) {
    const schemas = schema.oneOf
      .filter(isSchemaObject)
      .map((s) => toZod(s, depth - 1));
    if (schemas.length >= 2) {
      return z.union([schemas[0], schemas[1], ...schemas.slice(2)]);
    } else if (schemas.length === 1) {
      return schemas[0];
    }
  }

  if (schema.allOf) {
    const schemas = schema.allOf
      .filter(isSchemaObject)
      .map((s) => toZod(s, depth - 1));
    if (schemas.length === 0) return z.any();
    return schemas.reduce((acc, cur) => acc.and(cur));
  }

  // Handle primitive and complex types
  switch (schema.type) {
    case 'string': {
      let stringSchema = z.string();
      if (schema.minLength !== undefined)
        stringSchema = stringSchema.min(schema.minLength);
      if (schema.maxLength !== undefined)
        stringSchema = stringSchema.max(schema.maxLength);
      if (schema.pattern) {
        try {
          stringSchema = stringSchema.regex(new RegExp(schema.pattern));
        } catch {
          // Ignore invalid regex patterns
        }
      }
      return stringSchema;
    }

    case 'number':
    case 'integer': {
      let numberSchema = z.number();
      if (schema.type === 'integer') numberSchema = numberSchema.int();
      if (schema.minimum !== undefined)
        numberSchema = numberSchema.min(schema.minimum);
      if (schema.maximum !== undefined)
        numberSchema = numberSchema.max(schema.maximum);
      return numberSchema;
    }

    case 'boolean':
      return z.boolean();

    case 'null':
      return z.null();

    case 'array': {
      // Handle tuple arrays (items is an array)
      if (Array.isArray(schema.items)) {
        const itemSchemas = schema.items.map((el) =>
          isSchemaObject(el) ? toZod(el, depth - 1) : z.any()
        );
        if (itemSchemas.length >= 1) {
          return z.tuple([itemSchemas[0], ...itemSchemas.slice(1)]);
        }
        return z.tuple([]);
      }

      // Handle regular arrays
      const itemSchema = isSchemaObject(schema.items)
        ? toZod(schema.items, depth - 1)
        : z.any();
      let arraySchema = z.array(itemSchema);

      if (schema.minItems !== undefined)
        arraySchema = arraySchema.min(schema.minItems);
      if (schema.maxItems !== undefined)
        arraySchema = arraySchema.max(schema.maxItems);

      return arraySchema;
    }

    case 'object':
    case undefined: {
      // Handle object schemas (undefined type is treated as object)
      const shape: Record<string, ZodTypeAny> = {};
      const props = schema.properties ?? {};

      for (const [key, child] of Object.entries(props)) {
        shape[key] = isSchemaObject(child) ? toZod(child, depth - 1) : z.any();
      }

      let objectSchema = z.object(shape);

      // Handle required fields
      if (schema.required && schema.required.length > 0) {
        const refinedShape: Record<string, ZodTypeAny> = {};
        for (const [k, v] of Object.entries(shape)) {
          refinedShape[k] = schema.required.includes(k) ? v : v.optional();
        }
        objectSchema = z.object(refinedShape);
      } else {
        objectSchema = objectSchema.partial();
      }

      // Handle additionalProperties
      if (schema.additionalProperties === false) {
        return objectSchema.strict();
      }

      return objectSchema;
    }

    default:
      return assertNever(schema.type as never);
  }
}

/**
 * Converts an MCP JSON Schema to a Zod schema, with optional nullable support
 */
export function mcpSchemaToZod(schema: MCPJsonSchema): ZodTypeAny {
  const baseSchema = toZod(schema);
  return schema.nullable ? baseSchema.nullable() : baseSchema;
}
