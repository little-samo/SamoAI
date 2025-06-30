/**
 * Fixes common issues with JSON strings, particularly those returned by LLMs
 * - Removes markdown code fences
 * - Closes unclosed quotes and brackets
 * - Handles truncated JSON
 */
export function fixJson(jsonString: string): string {
  if (!jsonString || typeof jsonString !== 'string') {
    throw new Error('Input must be a non-empty string');
  }

  let fixed = jsonString.trim();

  // Remove markdown fences (similar to gemini.service.ts implementation)
  if (fixed.startsWith('```json')) {
    fixed = fixed.slice(7);
  } else if (fixed.startsWith('```')) {
    fixed = fixed.slice(3);
  }

  if (fixed.endsWith('```')) {
    fixed = fixed.slice(0, -3);
  }

  fixed = fixed.trim();

  // Track bracket and quote state
  const stack: Array<'{' | '[' | '"'> = [];
  let inString = false;
  let escaped = false;
  let lastNonWhitespaceIndex = -1;

  // Parse through the string to understand its structure
  for (let i = 0; i < fixed.length; i++) {
    const char = fixed[i];

    if (!char.match(/\s/)) {
      lastNonWhitespaceIndex = i;
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
      continue;
    }

    // Skip characters inside strings
    if (inString) {
      continue;
    }

    if (char === '{') {
      stack.push('{');
    } else if (char === '[') {
      stack.push('[');
    } else if (char === '}') {
      if (stack[stack.length - 1] === '{') {
        stack.pop();
      }
    } else if (char === ']') {
      if (stack[stack.length - 1] === '[') {
        stack.pop();
      }
    }
  }

  // Trim to last non-whitespace character + 1
  if (lastNonWhitespaceIndex >= 0) {
    fixed = fixed.substring(0, lastNonWhitespaceIndex + 1);
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
  while (stack.length > 0) {
    const unclosed = stack.pop();

    if (unclosed === '"') {
      // Close unclosed string
      fixed += '"';
    } else if (unclosed === '{') {
      // Close unclosed object
      // Remove trailing comma if present
      fixed = fixed.replace(/,\s*$/, '');
      fixed += '}';
    } else if (unclosed === '[') {
      // Close unclosed array
      // Remove trailing comma if present
      fixed = fixed.replace(/,\s*$/, '');
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
