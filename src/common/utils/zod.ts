import { z, type ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import type { JSONSchema7, JSONSchema7Definition } from 'json-schema';

/* ------------------------------------------------------------------
 * 0. Constants & helper utilities
 * ----------------------------------------------------------------*/

/** Extended JSONSchema7 type with custom properties */
type ExtendedJSONSchema7 = JSONSchema7 & {
  nullable?: boolean;
  isBigInt?: boolean;
  regexMessage?: string;
  coerceType?: 'bigint' | 'number' | 'string' | 'boolean';
};

/** Type definitions for Zod internal structures */
interface ZodStringDef {
  checks?: Array<{
    kind: string;
    message?: string;
  }>;
}

interface ZodObjectDef {
  shape?: () => Record<string, ZodTypeAny>;
}

interface ZodInternalDef {
  checks?: ZodStringDef['checks'];
  shape?: ZodObjectDef['shape'];
  type?: ZodTypeAny;
  items?: ZodTypeAny[];
}

interface ZodWithInternalDef {
  _def?: ZodInternalDef;
}

/** Type guards for Zod internal structures */
function hasZodDef(
  schema: ZodTypeAny
): schema is ZodTypeAny & ZodWithInternalDef {
  return typeof schema === 'object' && schema !== null && '_def' in schema;
}

function hasChecks(
  def: ZodInternalDef
): def is ZodInternalDef & { checks: NonNullable<ZodInternalDef['checks']> } {
  return Array.isArray(def.checks);
}

function hasShape(
  def: ZodInternalDef
): def is ZodInternalDef & { shape: NonNullable<ZodInternalDef['shape']> } {
  return typeof def.shape === 'function';
}

/** JSON-Schema keywords to keep when pruning */
const CORE_KEYS = new Set<keyof ExtendedJSONSchema7>([
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
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'anyOf',
  'oneOf',
  'allOf',
  'format',
  'additionalProperties',
  'nullable',
  'isBigInt',
  'regexMessage',
  'coerceType',
]);

/** Recursion guard – once depth is exhausted we fall back to never() */
const MAX_DEPTH = 8;

/** Exhaustiveness checker */
function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${String(x)}`);
}

/** Type guard for schema objects */
function isSchemaObject(
  def: JSONSchema7Definition | MCPJsonSchema | undefined
): def is MCPJsonSchema {
  return typeof def === 'object' && def !== null;
}

/** true if schema has no meaningful keywords (≒ undefined) */
function isTrulyEmpty(schema: MCPJsonSchema): boolean {
  // A schema is only truly empty if it has no keys at all or only non-core keys
  // AND no type-defining properties
  const hasNoCoreKeys = Object.keys(schema).every(
    (k) => !CORE_KEYS.has(k as keyof JSONSchema7)
  );

  // Even if it has no core keys, if it has type, properties, items, etc., it's not empty
  const hasTypeDefinition =
    schema.type ||
    schema.properties ||
    schema.items ||
    schema.anyOf ||
    schema.oneOf ||
    schema.allOf ||
    schema.enum ||
    schema.const;

  return hasNoCoreKeys && !hasTypeDefinition;
}

/* ------------------------------------------------------------------
 * Nullability helpers
 * ----------------------------------------------------------------*/
function withNullability<T extends ZodTypeAny>(
  schema: MCPJsonSchema,
  base: T,
  addNullable = false
): ZodTypeAny {
  let out: ZodTypeAny = base;
  if (schema.nullable || addNullable) out = out.nullable();
  // optional() handled later when we know if property is required
  return out;
}

/* ------------------------------------------------------------------
 * 1. Zod  →  (pruned) JSON-Schema string for LLMs
 * ----------------------------------------------------------------*/

/**
 * zod-to-json-schema prints `bigint()` as `{ type:'integer', format:'int64' }`.
 * We inject a custom flag so the inverse converter can rebuild z.coerce.bigint().
 */
function annotateBigInts(node: Record<string, unknown>): void {
  if (typeof node !== 'object' || node === null) return;

  if (
    (node.type === 'integer' && node.format === 'int64') ||
    (node.type === 'string' && node.format === 'bigint')
  ) {
    node.isBigInt = true;
  }

  const recurse = (v: unknown): void => {
    if (typeof v === 'object' && v !== null)
      annotateBigInts(v as Record<string, unknown>);
  };

  if (node.properties && typeof node.properties === 'object') {
    Object.values(node.properties).forEach(recurse);
  }
  if (node.items) {
    if (Array.isArray(node.items)) {
      node.items.forEach(recurse);
    } else {
      recurse(node.items);
    }
  }
  ['anyOf', 'oneOf', 'allOf'].forEach((k) => {
    const value = node[k];
    if (Array.isArray(value)) value.forEach(recurse);
  });
}

/** Extract regex custom messages from Zod schema and annotate JSON schema */
function annotateRegexMessages(
  zodSchema: ZodTypeAny,
  jsonSchema: Record<string, unknown>,
  path: string[] = []
): void {
  if (typeof jsonSchema !== 'object' || jsonSchema === null) return;

  try {
    // Check if this is a string schema with pattern and get the zod schema
    if (
      jsonSchema.type === 'string' &&
      jsonSchema.pattern &&
      typeof jsonSchema.pattern === 'string'
    ) {
      // Try to extract custom error message from zod schema
      if (hasZodDef(zodSchema)) {
        const zodDef = zodSchema._def;
        if (zodDef && hasChecks(zodDef)) {
          const regexCheck = zodDef.checks.find(
            (check: { kind: string; message?: string }) =>
              check.kind === 'regex'
          );
          if (regexCheck && regexCheck.message) {
            jsonSchema.regexMessage = regexCheck.message;
          }
        }
      }
    }

    // Recursively process object properties
    if (jsonSchema.properties && typeof jsonSchema.properties === 'object') {
      if (hasZodDef(zodSchema)) {
        const zodDef = zodSchema._def;
        if (zodDef && hasShape(zodDef)) {
          const shape = zodDef.shape();
          Object.entries(jsonSchema.properties).forEach(([key, value]) => {
            if (shape[key] && typeof value === 'object' && value !== null) {
              annotateRegexMessages(
                shape[key],
                value as Record<string, unknown>,
                [...path, key]
              );
            }
          });
        }
      }
    }

    // Recursively process array items
    if (jsonSchema.items) {
      if (hasZodDef(zodSchema)) {
        const zodDef = zodSchema._def;
        if (Array.isArray(jsonSchema.items)) {
          jsonSchema.items.forEach((item, index) => {
            if (
              typeof item === 'object' &&
              item !== null &&
              zodDef?.items?.[index]
            ) {
              annotateRegexMessages(
                zodDef.items[index],
                item as Record<string, unknown>,
                [...path, index.toString()]
              );
            }
          });
        } else if (
          typeof jsonSchema.items === 'object' &&
          jsonSchema.items !== null &&
          zodDef?.type
        ) {
          annotateRegexMessages(
            zodDef.type,
            jsonSchema.items as Record<string, unknown>,
            [...path, 'items']
          );
        }
      }
    }

    // Process anyOf, oneOf, allOf
    ['anyOf', 'oneOf', 'allOf'].forEach((key) => {
      const value = jsonSchema[key];
      if (Array.isArray(value)) {
        value.forEach((subSchema, index) => {
          if (typeof subSchema === 'object' && subSchema !== null) {
            // This is more complex for unions, but we'll handle simple cases
            annotateRegexMessages(
              zodSchema,
              subSchema as Record<string, unknown>,
              [...path, key, index.toString()]
            );
          }
        });
      }
    });
  } catch (error) {
    // Ignore errors in regex message extraction
    console.warn('Error extracting regex message:', error);
  }
}

/** Remove noisy metadata and keep only CORE_KEYS recursively */
function prune(schema: JSONSchema7, depth = MAX_DEPTH): JSONSchema7 {
  if (depth <= 0 || typeof schema !== 'object' || schema === null)
    return schema;

  const dst: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (!CORE_KEYS.has(k as keyof ExtendedJSONSchema7)) continue;

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
      case 'additionalProperties': {
        if (typeof v === 'object' && v !== null) {
          dst.additionalProperties = prune(v as JSONSchema7, depth - 1);
        } else {
          dst.additionalProperties = v;
        }
        break;
      }
      default:
        dst[k] = v;
    }
  }

  if (Array.isArray(dst.required) && dst.required.length === 0)
    delete dst.required;

  // preserve bigint flag et al.
  if ('isBigInt' in schema) dst.isBigInt = true;
  if ('nullable' in schema) dst.nullable = schema.nullable;
  if ('regexMessage' in schema) dst.regexMessage = schema.regexMessage;
  if ('coerceType' in schema) dst.coerceType = schema.coerceType;

  return dst as JSONSchema7;
}

export function zodSchemaToLlmFriendlyString(schema: ZodTypeAny): string {
  // Disable deduplication to prevent empty object items in arrays
  const draft = zodToJsonSchema(schema, {
    $refStrategy: 'none', // Disable $ref usage to prevent deduplication
  }) as JSONSchema7;
  annotateBigInts(draft as Record<string, unknown>);
  annotateRegexMessages(schema, draft as Record<string, unknown>);
  delete draft.$schema;
  delete draft.$id;
  delete draft.title;
  delete draft.default;
  delete draft.examples;
  return JSON.stringify(prune(draft));
}

/* ------------------------------------------------------------------
 * 2. Draft-07 subset (+extensions)  →  Zod
 * ----------------------------------------------------------------*/

export type MCPJsonSchema = JSONSchema7 & {
  /** OpenAPI-style nullability flag */
  nullable?: boolean;
  /** Added by annotateBigInts for round-tripping */
  isBigInt?: boolean;
  /** Added for preserving regex custom error messages */
  regexMessage?: string;
  /** Explicit coercion intention coming from upstream application */
  coerceType?: 'bigint' | 'number' | 'string' | 'boolean';
};

/** Build a z.union(), collapsing size 0 → never, size 1 → identity */
function buildUnion(parts: ZodTypeAny[]): ZodTypeAny {
  if (parts.length === 0) return z.never();
  if (parts.length === 1) return parts[0];
  return z.union(parts as [ZodTypeAny, ZodTypeAny, ...ZodTypeAny[]]);
}

function toZod(schema: MCPJsonSchema, depth = MAX_DEPTH): ZodTypeAny {
  if (depth <= 0) return z.never();

  /* --- handle completely empty branch --------------------- */
  if (isTrulyEmpty(schema)) {
    return z.undefined();
  }

  /* ----------------------------------------------------------------
   * 0. If the `type` itself is an array treat it as a union
   * --------------------------------------------------------------*/
  if (Array.isArray(schema.type)) {
    const hasNull = schema.type.includes('null');
    const variants = schema.type
      .filter((t): t is NonNullable<typeof t> => t !== 'null')
      .map((t) => toZod({ ...schema, type: t }, depth - 1));

    return withNullability(schema, buildUnion(variants), hasNull);
  }

  /* ----------------------------------------------------------------
   * 1. BigInt coercion – highest priority so it short-circuits early
   * --------------------------------------------------------------*/
  if (schema.coerceType === 'bigint' || schema.isBigInt) {
    return withNullability(schema, z.coerce.bigint());
  }

  /* ----------------------------------------------------------------
   * 2. const / enum handling
   * --------------------------------------------------------------*/
  if ('const' in schema) {
    const constValue = schema.const;
    if (
      typeof constValue === 'string' ||
      typeof constValue === 'number' ||
      typeof constValue === 'boolean' ||
      constValue === null
    ) {
      return withNullability(schema, z.literal(constValue));
    }
    return z.never();
  }
  if (schema.enum) {
    const literals = schema.enum.map((e) => {
      if (
        typeof e === 'string' ||
        typeof e === 'number' ||
        typeof e === 'boolean' ||
        e === null
      ) {
        return z.literal(e);
      }
      return z.never();
    });
    return withNullability(schema, buildUnion(literals));
  }

  /* ----------------------------------------------------------------
   * 3. anyOf / oneOf / allOf  (compose recursively)
   * --------------------------------------------------------------*/
  const compose = (
    key: 'anyOf' | 'oneOf' | 'allOf'
  ): ZodTypeAny | undefined => {
    if (!schema[key]) return undefined;
    const arr = (schema[key] as MCPJsonSchema[]).filter(isSchemaObject);

    const hasNull = arr.some((s) => s.type === 'null');
    const variants = arr
      .filter((s) => s.type !== 'null')
      .map((s) => toZod(s, depth - 1));

    if (key === 'allOf') {
      if (variants.length === 0) return z.never();
      if (variants.length === 1)
        return withNullability(schema, variants[0], hasNull);
      const intersection = variants
        .slice(1)
        .reduce<ZodTypeAny>((a, b) => z.intersection(a, b), variants[0]);
      return withNullability(schema, intersection, hasNull);
    }

    // anyOf  → simple union
    if (key === 'anyOf') {
      return withNullability(schema, buildUnion(variants), hasNull);
    }

    // oneOf → union + mutual-exclusion refine
    const union = buildUnion(variants);
    const exclusive = union.refine(
      (val) => variants.filter((v) => v.safeParse(val).success).length === 1,
      { message: 'Must match exactly one schema' }
    );
    return withNullability(schema, exclusive, hasNull);
  };

  const composite = compose('anyOf') ?? compose('oneOf') ?? compose('allOf');
  if (composite) return composite;

  /* ----------------------------------------------------------------
   * 4. Primitive & complex types
   * --------------------------------------------------------------*/
  switch (schema.type) {
    /* --------------------------- string -------------------------*/
    case 'string': {
      let s = z.string();

      switch (schema.format) {
        case 'email':
          s = s.email();
          break;
        case 'uri':
        case 'url':
          s = s.url();
          break;
        case 'uuid':
          s = s.uuid();
          break;
        case 'date':
          s = s.regex(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD
          break;
        case 'date-time':
          s = s.datetime();
          break;
        case 'bigint':
          return withNullability(schema, z.coerce.bigint());
      }

      if (schema.minLength !== undefined) s = s.min(schema.minLength);
      if (schema.maxLength !== undefined) s = s.max(schema.maxLength);
      if (schema.pattern) {
        try {
          const regexPattern = new RegExp(schema.pattern);
          if (schema.regexMessage) {
            s = s.regex(regexPattern, schema.regexMessage);
          } else {
            s = s.regex(regexPattern);
          }
        } catch {
          /* ignore invalid regex */
        }
      }
      return withNullability(schema, s);
    }

    /* --------------------------- number / integer --------------*/
    case 'number':
    case 'integer': {
      if (
        schema.format === 'bigint' ||
        schema.format === 'int64' ||
        schema.isBigInt
      ) {
        return withNullability(schema, z.coerce.bigint());
      }

      let n = z.number();
      if (schema.type === 'integer') n = n.int();

      if (schema.minimum !== undefined) n = n.min(schema.minimum);
      if (schema.maximum !== undefined) n = n.max(schema.maximum);
      if (schema.exclusiveMinimum !== undefined)
        n = n.gt(schema.exclusiveMinimum);
      if (schema.exclusiveMaximum !== undefined)
        n = n.lt(schema.exclusiveMaximum);

      if (schema.multipleOf !== undefined) {
        const m = schema.multipleOf;
        const refined = n.refine(
          (v) => {
            const eps = Number.EPSILON * Math.max(1, Math.abs(v), Math.abs(m));
            const mod = Math.abs(v % m);
            return mod < eps || Math.abs(mod - m) < eps;
          },
          { message: `Must be a multiple of ${m}` }
        );
        return withNullability(schema, refined);
      }
      return withNullability(schema, n);
    }

    /* --------------------------- boolean -----------------------*/
    case 'boolean':
      return withNullability(schema, z.boolean());

    /* --------------------------- null --------------------------*/
    case 'null':
      return withNullability(schema, z.null(), true);

    /* --------------------------- array -------------------------*/
    case 'array': {
      if (Array.isArray(schema.items)) {
        const items = schema.items.map((el) =>
          isSchemaObject(el) ? toZod(el, depth - 1) : z.never()
        );

        // tuple
        const tuple = z.tuple(items as [ZodTypeAny, ...ZodTypeAny[]]);

        // apply minItems / maxItems to tuple where relevant
        if (schema.minItems !== undefined) {
          const minItemsRefined = tuple.refine(
            (v) => v.length >= schema.minItems!,
            {
              message: `Tuple must have at least ${schema.minItems} items`,
            }
          );
          if (schema.maxItems !== undefined) {
            return withNullability(
              schema,
              minItemsRefined.refine((v) => v.length <= schema.maxItems!, {
                message: `Tuple must have at most ${schema.maxItems} items`,
              })
            );
          }
          return withNullability(schema, minItemsRefined);
        }
        if (schema.maxItems !== undefined) {
          const maxItemsRefined = tuple.refine(
            (v) => v.length <= schema.maxItems!,
            {
              message: `Tuple must have at most ${schema.maxItems} items`,
            }
          );
          return withNullability(schema, maxItemsRefined);
        }

        return withNullability(schema, tuple);
      }

      let itemSchema: ZodTypeAny;
      if (isSchemaObject(schema.items)) {
        // Check if items is truly empty (likely from zod-to-json-schema deduplication)
        if (isTrulyEmpty(schema.items)) {
          // For empty object items in arrays, use z.unknown() instead of z.undefined()
          // This allows any object structure and prevents validation errors
          itemSchema = z.unknown();
        } else {
          itemSchema = toZod(schema.items, depth - 1);
        }
      } else {
        itemSchema = z.never();
      }
      let arr = z.array(itemSchema);
      if (schema.minItems !== undefined) arr = arr.min(schema.minItems);
      if (schema.maxItems !== undefined) arr = arr.max(schema.maxItems);
      return withNullability(schema, arr);
    }

    /* --------------------------- object ------------------------*/
    case 'object':
    case undefined: {
      const props = schema.properties ?? {};
      const shape: Record<string, ZodTypeAny> = {};
      for (const [k, v] of Object.entries(props)) {
        shape[k] = isSchemaObject(v) ? toZod(v, depth - 1) : z.never();
      }

      // start with all required, we'll relax later if needed
      const required = schema.required ?? [];
      let obj: ZodTypeAny;

      if (required.length > 0) {
        const refined: Record<string, ZodTypeAny> = {};
        for (const [k, v] of Object.entries(shape)) {
          refined[k] = required.includes(k) ? v : v.optional();
        }
        obj = z.object(refined);
      } else {
        obj = z.object(shape).partial();
      }

      if (schema.additionalProperties === false) {
        // Type guard to ensure obj is ZodObject
        if (obj instanceof z.ZodObject) {
          obj = obj.strict();
        }
      } else if (
        typeof schema.additionalProperties === 'object' &&
        schema.additionalProperties !== null
      ) {
        const additionalSchema = schema.additionalProperties as MCPJsonSchema;

        // Check if this is a nested record structure (additionalProperties with additionalProperties)
        if (
          additionalSchema.type === 'object' &&
          typeof additionalSchema.additionalProperties === 'object' &&
          additionalSchema.additionalProperties !== null &&
          Object.keys(props).length === 0
        ) {
          // This is a nested record like z.record(z.record(z.string()))
          return withNullability(
            schema,
            z.record(
              z.record(
                toZod(
                  additionalSchema.additionalProperties as MCPJsonSchema,
                  depth - 2
                )
              )
            )
          );
        }

        // Regular additionalProperties - use catchall if we have an object
        if (obj instanceof z.ZodObject) {
          obj = obj.catchall(toZod(additionalSchema, depth - 1));
        } else {
          // If no defined properties, use z.record
          return withNullability(
            schema,
            z.record(toZod(additionalSchema, depth - 1))
          );
        }
      } else if (
        schema.additionalProperties === true ||
        (schema.additionalProperties === undefined &&
          Object.keys(props).length === 0)
      ) {
        // When additionalProperties is true or undefined with no defined properties,
        // this indicates a z.record() schema that should accept any key-value pairs
        return withNullability(schema, z.record(z.unknown()));
      }

      return withNullability(schema, obj);
    }

    default:
      return assertNever(schema.type as never);
  }
}

export function mcpSchemaToZod(schema: MCPJsonSchema): ZodTypeAny {
  return toZod(schema);
}

/** Nicely format a ZodError for humans */
export function formatZodErrorMessage(error: z.ZodError): string {
  return error.errors
    .map((e) => `${e.path.length ? e.path.join('.') : '(root)'}: ${e.message}`)
    .join(', ');
}
