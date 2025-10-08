/**
 * Removes JavaScript-style comments from JSON while preserving string content
 * Handles both single-line (//) and multi-line (/* *\/) comments
 */
function removeCommentsFromJson(jsonString: string): string {
  // Match strings OR comments in a single regex
  // Strings take precedence because they're matched first
  const pattern = /"(?:[^"\\]|\\.)*"|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

  return jsonString.replace(pattern, (match) => {
    // If it starts with ", it's a string - keep it
    if (match[0] === '"') {
      return match;
    }
    // Otherwise it's a comment - remove it (but keep newline for //)
    if (match.startsWith('//')) {
      return '\n';
    }
    return '';
  });
}

/**
 * Extracts JSON blocks from text that may contain ```json code fences
 * Returns the first valid JSON block found, or the original string if no blocks found
 */
export function extractJsonBlocksFromText(text: string): string {
  if (!text || typeof text !== 'string') {
    return text;
  }

  // Look for ```json blocks in the text
  const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/gi;
  const matches = [...text.matchAll(jsonBlockRegex)];

  if (matches.length > 0) {
    // Try each JSON block until we find one that's likely valid
    for (const match of matches) {
      const jsonContent = match[1]?.trim();
      if (
        jsonContent &&
        (jsonContent.startsWith('{') || jsonContent.startsWith('['))
      ) {
        return jsonContent;
      }
    }

    // If no block starts with { or [, return the first non-empty one
    for (const match of matches) {
      const jsonContent = match[1]?.trim();
      if (jsonContent) {
        return jsonContent;
      }
    }
  }

  // If no ```json blocks found, return original text
  return text;
}

/**
 * Fixes common issues with JSON strings, particularly those returned by LLMs
 * - Extracts JSON from markdown code fences if present
 * - Removes markdown code fences
 * - Removes common LLM prefixes/tags ([TOOL_CALLS], [ASSISTANT], etc.)
 * - Removes explanatory text before JSON
 * - Removes comments (single-line and multi-line) while preserving string content
 * - Removes trailing commas before closing brackets
 * - Closes unclosed quotes and brackets
 * - Handles truncated JSON
 */
export function fixJson(jsonString: string): string {
  if (!jsonString || typeof jsonString !== 'string') {
    throw new Error('Input must be a non-empty string');
  }

  // First, try to extract JSON blocks from text (handles text with ```json blocks)
  let fixed = extractJsonBlocksFromText(jsonString).trim();

  // Remove line-start tags before attempting to find JSON
  // Tags like [TOOL_CALLS], <tool_calls> usually appear at line starts
  fixed = fixed
    .replace(/^\s*\[[A-Z_]+\]\s*/gm, '') // [TOOL_CALLS] etc at line start
    .replace(/^\s*<\/?[a-z_]+>\s*/gim, '') // <tool_calls> etc at line start
    .replace(/^\s*```(?:json)?\s*/gim, '') // ```json at line start
    .replace(/```\s*$/gm, '') // ``` at line end
    .trim();

  // Now find actual JSON start: either { or [
  // Be careful to distinguish between JSON arrays and tags like [TOOL_CALLS]
  const jsonObjectStart = fixed.indexOf('{');

  // For arrays, look for [ followed by valid JSON content or closing bracket
  // This includes empty arrays [], negative numbers, etc.
  const jsonArrayStart = fixed.search(/\[\s*(-?\d|"|\{|\[|\]|true|false|null)/);

  let firstBraceIndex = -1;
  if (jsonObjectStart !== -1 && jsonArrayStart !== -1) {
    firstBraceIndex = Math.min(jsonObjectStart, jsonArrayStart);
  } else if (jsonObjectStart !== -1) {
    firstBraceIndex = jsonObjectStart;
  } else if (jsonArrayStart !== -1) {
    firstBraceIndex = jsonArrayStart;
  }

  if (firstBraceIndex > 0) {
    // Remove any remaining text before JSON
    fixed = fixed.substring(firstBraceIndex);
  }

  // Remove comments (both single-line and multi-line) while preserving strings
  // This is done BEFORE parsing to avoid affecting string content
  fixed = removeCommentsFromJson(fixed);

  // Remove trailing commas before closing brackets (common LLM mistake)
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1');

  // Track bracket and quote state
  const stack: Array<'{' | '[' | '"'> = [];
  let inString = false;
  let escaped = false;
  let lastValidIndex = -1; // Track the last valid character position
  let jsonCompleted = false; // Track if we've completed the root JSON structure

  // Parse through the string to understand its structure
  for (let i = 0; i < fixed.length; i++) {
    const char = fixed[i];

    // If JSON is completed and we find non-whitespace, stop parsing
    if (
      jsonCompleted &&
      char !== ' ' &&
      char !== '\t' &&
      char !== '\n' &&
      char !== '\r'
    ) {
      break;
    }

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }

    if (char === '"') {
      if (inString) {
        // Closing quote
        inString = false;
        if (stack[stack.length - 1] === '"') {
          stack.pop();
        }
      } else {
        // Opening quote
        inString = true;
        stack.push('"');
      }
      lastValidIndex = i;
      continue;
    }

    // Skip characters inside strings
    if (inString) {
      lastValidIndex = i;
      continue;
    }

    if (char === '{') {
      stack.push('{');
      lastValidIndex = i;
    } else if (char === '[') {
      stack.push('[');
      lastValidIndex = i;
    } else if (char === '}') {
      if (stack[stack.length - 1] === '{') {
        stack.pop();
        lastValidIndex = i;
        // Check if we've completed the root JSON structure
        if (stack.length === 0) {
          jsonCompleted = true;
        }
      }
      // If no matching opening bracket, this is an excess closing bracket - don't update lastValidIndex
    } else if (char === ']') {
      if (stack[stack.length - 1] === '[') {
        stack.pop();
        lastValidIndex = i;
        // Check if we've completed the root JSON structure
        if (stack.length === 0) {
          jsonCompleted = true;
        }
      }
      // If no matching opening bracket, this is an excess closing bracket - don't update lastValidIndex
    } else if (
      char !== ' ' &&
      char !== '\t' &&
      char !== '\n' &&
      char !== '\r'
    ) {
      // Other non-whitespace characters (commas, colons, etc.)
      lastValidIndex = i;
    }
  }

  // Trim to last valid character + 1 (removes excess closing brackets)
  if (lastValidIndex >= 0) {
    fixed = fixed.substring(0, lastValidIndex + 1);
  }

  // Handle backslash truncation
  if (escaped && inString && fixed.length > 0) {
    const lastChar = fixed[fixed.length - 1];
    if (lastChar === '\\') {
      // JSON string ends with a lone backslash
      // Check if it's part of a common escape sequence that got truncated
      const beforeBackslash = fixed.length > 1 ? fixed[fixed.length - 2] : '';

      if (beforeBackslash === '\\') {
        // It's \\, which is a valid escaped backslash, keep it
        // Do nothing
      } else {
        // It's a lone backslash, likely truncated
        // Remove it to avoid invalid JSON
        fixed = fixed.slice(0, -1);
      }
    }
    // Reset escaped state since we're handling it
    escaped = false;
  }

  // Fix unclosed structures
  const trailingCommaRegex = /,\s*$/;
  while (stack.length > 0) {
    const unclosed = stack.pop();

    if (unclosed === '"') {
      // Close unclosed string
      fixed += '"';
    } else if (unclosed === '{') {
      // Close unclosed object
      // Remove trailing comma if present
      fixed = fixed.replace(trailingCommaRegex, '');
      fixed += '}';
    } else if (unclosed === '[') {
      // Close unclosed array
      // Remove trailing comma if present
      fixed = fixed.replace(trailingCommaRegex, '');
      fixed += ']';
    }
  }

  return fixed;
}

/**
 * Attempts to parse and fix JSON, returning the parsed object or throwing an error
 */
export function parseAndFixJson<T = unknown>(jsonString: string): T {
  try {
    // First try parsing as-is
    return JSON.parse(jsonString);
  } catch {
    // If that fails, try fixing the JSON first
    try {
      const fixedJson = fixJson(jsonString);
      return JSON.parse(fixedJson);
    } catch (fixError) {
      const errorMessage =
        fixError instanceof Error ? fixError.message : String(fixError);
      throw new Error(
        `Failed to parse JSON even after fixing: ${errorMessage}`
      );
    }
  }
}

/**
 * Safely attempts to parse JSON, returning null if parsing fails
 */
export function safeParseJson<T = unknown>(jsonString: string): T | null {
  try {
    return parseAndFixJson<T>(jsonString);
  } catch {
    return null;
  }
}
