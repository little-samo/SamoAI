import { fixJson } from './json';

export interface PartialFieldUpdate {
  index: number;
  toolName: string;
  entityKey?: string;
  argumentKey: string;
  value: string;
  delta: string;
}

interface CurrentObjectState {
  name: string | null;
  inArguments: boolean;
  currentKey: string | null;
  keyDepth: number;
  isComplete: boolean;
  accumulatedValue: string;
  isTrackingField: boolean;
  isTrackingEntityKey: boolean; // Track if we're currently streaming entityKey
  entityKeyValue: string; // Accumulated entityKey value during streaming
  startDepth: number; // Track the depth at which this tool call started
}

/**
 * Converts a pattern with wildcards (*) to a regex pattern
 * @param pattern - e.g., "send_*_message" or "exact_match"
 * @returns RegExp for matching
 */
function patternToRegex(pattern: string): RegExp {
  // Escape special regex characters except *
  const escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  // Replace * with regex pattern for any characters
  const regexPattern = '^' + escapedPattern.replace(/\*/g, '.*') + '$';
  return new RegExp(regexPattern);
}

/**
 * Parses a streaming JSON object in the format {toolCalls: [{...}, {...}, {...}]}
 * and yields complete tool call objects as they arrive
 *
 * Optimized for tool call format:
 * { "toolCalls": [{ "name": "tool_name", "arguments": { "key": "value", ... } }, ...] }
 *
 * Performance Optimizations:
 * - O(n) complexity: Incremental character accumulation (not re-parsing from start)
 * - Flag-based tracking: Single condition check per character for tracked fields
 * - Memory management: Automatic cleanup of completed object field values
 */
export class JsonArrayStreamParser {
  private buffer = '';
  private depth = 0;
  private inString = false;
  private escaped = false;
  private rootObjectStarted = false;
  private arrayStarted = false;
  private objectStartIndex = -1;
  private yieldedCount = 0;
  private trackedPairs: RegExp[] = []; // "toolName:argumentKey" patterns (supports wildcards)
  private onFieldUpdate?: (update: PartialFieldUpdate) => void;

  // Current object parsing state
  private currentObject: CurrentObjectState | null = null;
  private fieldValues = new Map<string, string>(); // "index:key" -> value
  private entityKeys = new Map<number, string>(); // index -> entityKey value

  // String parsing state
  private currentStringStart = -1;
  private lastJsonKey: string | null = null;
  private lastString: string | null = null;

  /**
   * Set a callback to be notified when specific fields are updated
   */
  public setFieldUpdateCallback(
    callback: (update: PartialFieldUpdate) => void
  ): void {
    this.onFieldUpdate = callback;
  }

  /**
   * Track specific (toolName, argumentKey) pairs for partial updates
   * Supports wildcard patterns with * (e.g., 'send_*_message')
   * @param pairs - e.g., [['send_message', 'message'], ['send_*_message', 'message'], ['send_casual_message', 'casualPolicyViolatingAnswer']]
   */
  public trackToolFields(pairs: Array<[string, string]>): void {
    this.trackedPairs = pairs.map(([toolName, argumentKey]) =>
      patternToRegex(`${toolName}:${argumentKey}`)
    );
  }

  /**
   * Checks if a toolName:argumentKey pair matches any tracked pattern
   */
  private matchesTrackedPair(toolName: string, argumentKey: string): boolean {
    const pairKey = `${toolName}:${argumentKey}`;
    return this.trackedPairs.some((regex) => regex.test(pairKey));
  }

  /**
   * Extracts the current string value from buffer
   */
  private extractStringValue(startIndex: number, endIndex: number): string {
    let value = '';
    let i = startIndex;

    while (i < endIndex) {
      const char = this.buffer[i];

      if (char === '\\' && i + 1 < endIndex) {
        const nextChar = this.buffer[i + 1];
        // Handle escape sequences
        switch (nextChar) {
          case '"':
          case '\\':
          case '/':
            value += nextChar;
            i += 2;
            break;
          case 'n':
            value += '\n';
            i += 2;
            break;
          case 'r':
            value += '\r';
            i += 2;
            break;
          case 't':
            value += '\t';
            i += 2;
            break;
          default:
            value += char;
            i++;
        }
      } else {
        value += char;
        i++;
      }
    }

    return value;
  }

  /**
   * Resets current object state
   */
  private resetCurrentObject(startDepth: number): void {
    this.currentObject = {
      name: null,
      inArguments: false,
      currentKey: null,
      keyDepth: 0,
      isComplete: false,
      accumulatedValue: '',
      isTrackingField: false,
      isTrackingEntityKey: false,
      entityKeyValue: '',
      startDepth,
    };
  }

  /**
   * Emits field update if value has changed
   */
  private emitFieldUpdate(
    index: number,
    toolName: string,
    argumentKey: string,
    newValue: string
  ): void {
    // Don't emit if object is already complete
    if (this.currentObject?.isComplete) {
      return;
    }

    // Only emit for tracked (toolName, argumentKey) pairs
    if (!this.matchesTrackedPair(toolName, argumentKey)) {
      return;
    }

    const fieldKey = `${index}:${argumentKey}`;
    const oldValue = this.fieldValues.get(fieldKey) || '';

    if (newValue !== oldValue && newValue.length > 0) {
      const delta = newValue.substring(oldValue.length);

      if (this.onFieldUpdate && delta.length > 0) {
        const entityKey = this.entityKeys.get(index);
        this.onFieldUpdate({
          index,
          toolName,
          argumentKey,
          value: newValue,
          delta,
          ...(entityKey && { entityKey }),
        });
      }

      this.fieldValues.set(fieldKey, newValue);
    }
  }

  /**
   * Processes a chunk of text and yields any complete objects found
   */
  public *processChunk(
    chunk: string
  ): Generator<{ json: string; index: number }> {
    this.buffer += chunk;
    const startPos = this.buffer.length - chunk.length;

    for (let i = startPos; i < this.buffer.length; i++) {
      const char = this.buffer[i];

      // Handle escape sequences
      if (this.escaped) {
        this.escaped = false;

        // Incremental accumulation for escaped characters
        if (this.inString && this.currentObject) {
          let escapedChar: string | null = null;
          switch (char) {
            case '"':
            case '\\':
            case '/':
              escapedChar = char;
              break;
            case 'n':
              escapedChar = '\n';
              break;
            case 'r':
              escapedChar = '\r';
              break;
            case 't':
              escapedChar = '\t';
              break;
            default:
              escapedChar = '\\' + char;
          }

          if (escapedChar !== null) {
            if (this.currentObject.isTrackingEntityKey) {
              this.currentObject.entityKeyValue += escapedChar;
              this.entityKeys.set(
                this.yieldedCount,
                this.currentObject.entityKeyValue
              );
            } else if (this.currentObject.isTrackingField) {
              this.currentObject.accumulatedValue += escapedChar;
              this.emitFieldUpdate(
                this.yieldedCount,
                this.currentObject.name!,
                this.currentObject.currentKey!,
                this.currentObject.accumulatedValue
              );
            }
          }
        }

        continue;
      }

      if (char === '\\' && this.inString) {
        this.escaped = true;
        continue;
      }

      // Track string boundaries
      if (char === '"') {
        if (!this.inString) {
          this.inString = true;
          this.currentStringStart = i + 1;

          // Optimization: Determine if we should track this field ONCE
          if (
            this.currentObject &&
            this.currentObject.name &&
            this.currentObject.inArguments &&
            this.lastJsonKey &&
            this.depth === this.currentObject.keyDepth
          ) {
            // Check if this is the entityKey field
            if (this.lastJsonKey === 'entityKey') {
              this.currentObject.isTrackingEntityKey = true;
              this.currentObject.entityKeyValue = '';
            }
            // Check if this is a tracked field for streaming
            else if (
              this.matchesTrackedPair(this.currentObject.name, this.lastJsonKey)
            ) {
              this.currentObject.isTrackingField = true;
              this.currentObject.accumulatedValue = '';
            }
          }
        } else {
          this.inString = false;

          // Extract the completed string value
          const stringValue = this.extractStringValue(
            this.currentStringStart,
            i
          );

          // Store the string - we'll determine if it's a key or value when we see the next delimiter
          this.lastString = stringValue;

          // If we were tracking entityKey, store it in the map immediately
          if (this.currentObject?.isTrackingEntityKey) {
            this.entityKeys.set(
              this.yieldedCount,
              this.currentObject.entityKeyValue
            );
            this.currentObject.isTrackingEntityKey = false;
            this.currentObject.entityKeyValue = '';
          }

          // Reset tracking flag when string ends
          if (this.currentObject?.isTrackingField) {
            this.currentObject.isTrackingField = false;
            this.currentObject.accumulatedValue = '';
          }
        }
        continue;
      }

      // Incremental character accumulation for tracked fields and entityKey
      // Note: Escape sequences and backslashes are handled above (224-274)
      if (this.inString && this.currentObject) {
        if (this.currentObject.isTrackingEntityKey) {
          this.currentObject.entityKeyValue += char;
          this.entityKeys.set(
            this.yieldedCount,
            this.currentObject.entityKeyValue
          );
        } else if (this.currentObject.isTrackingField) {
          this.currentObject.accumulatedValue += char;
          this.emitFieldUpdate(
            this.yieldedCount,
            this.currentObject.name!,
            this.currentObject.currentKey!,
            this.currentObject.accumulatedValue
          );
        }
      }

      // Skip other characters inside strings
      if (this.inString) {
        continue;
      }

      // Track root object start
      if (char === '{' && this.depth === 0 && !this.rootObjectStarted) {
        this.rootObjectStarted = true;
        this.depth++;
        continue;
      }

      // Track toolCalls/tool_calls array start
      if (
        char === '[' &&
        this.depth === 1 &&
        (this.lastJsonKey === 'toolCalls' ||
          this.lastJsonKey === 'tool_calls') &&
        !this.arrayStarted
      ) {
        this.arrayStarted = true;
      }

      // Always increment depth for arrays
      if (char === '[') {
        this.depth++;
        continue;
      }

      // Handle string values before structural changes
      if (char === ',' || char === '}' || char === ']') {
        // The last string was a value (or we're at end of object/array)
        if (this.lastString !== null && this.lastJsonKey !== null) {
          // Process the key-value pair
          if (this.currentObject) {
            if (
              (this.lastJsonKey === 'name' ||
                this.lastJsonKey === 'function' ||
                this.lastJsonKey === 'tool') &&
              this.depth === 3
            ) {
              this.currentObject.name = this.lastString;
            } else if (
              this.currentObject.inArguments &&
              this.currentObject.currentKey === this.lastJsonKey &&
              this.depth === this.currentObject.keyDepth
            ) {
              // Store entityKey if this is the entityKey field
              if (this.lastJsonKey === 'entityKey') {
                this.entityKeys.set(this.yieldedCount, this.lastString);
              }

              // String value completed for tracked argument
              if (
                this.currentObject.name &&
                this.matchesTrackedPair(
                  this.currentObject.name,
                  this.lastJsonKey
                )
              ) {
                this.emitFieldUpdate(
                  this.yieldedCount,
                  this.currentObject.name,
                  this.lastJsonKey,
                  this.lastString
                );
              }
              this.currentObject.currentKey = null;
            }
          }
          this.lastString = null;
          this.lastJsonKey = null;
        }
      }

      // Track object boundaries
      if (char === '{') {
        // Tool call object starts at depth 2 (inside toolCalls array)
        if (this.depth === 2 && this.arrayStarted) {
          this.objectStartIndex = i;
          this.resetCurrentObject(this.depth + 1); // Will be depth 3 after increment
        }

        // Increment depth after checking for tool call start
        this.depth++;

        // Check if we're entering "arguments" (or "parameters"/"params"/"args")
        if (
          this.currentObject &&
          (this.lastJsonKey === 'arguments' ||
            this.lastJsonKey === 'parameters' ||
            this.lastJsonKey === 'params' ||
            this.lastJsonKey === 'args') &&
          this.depth === this.currentObject.startDepth + 1
        ) {
          this.currentObject.inArguments = true;
          this.currentObject.keyDepth = this.depth;
        }
      } else if (char === '}') {
        this.depth--;

        // Check if we're leaving arguments
        if (
          this.currentObject &&
          this.currentObject.inArguments &&
          this.depth === this.currentObject.keyDepth
        ) {
          this.currentObject.inArguments = false;
          this.currentObject.currentKey = null;
        }

        // Complete tool call object - check if we're back to the depth where it started
        if (
          this.currentObject &&
          this.objectStartIndex !== -1 &&
          this.depth === this.currentObject.startDepth - 1
        ) {
          // We have a complete tool call object
          this.currentObject.isComplete = true;

          const objectJson = this.buffer.substring(
            this.objectStartIndex,
            i + 1
          );

          yield { json: objectJson, index: this.yieldedCount };

          // Memory cleanup: remove field values for completed object
          for (const key of this.fieldValues.keys()) {
            if (key.startsWith(`${this.yieldedCount}:`)) {
              this.fieldValues.delete(key);
            }
          }

          // Cleanup entityKey for completed object
          this.entityKeys.delete(this.yieldedCount);

          this.yieldedCount++;
          this.objectStartIndex = -1;
          this.currentObject = null;
          this.lastJsonKey = null;
        }
      } else if (char === ']') {
        this.depth--;
        // Exiting toolCalls array
        if (this.depth === 1 && this.arrayStarted) {
          this.arrayStarted = false;
        }
        this.lastString = null;
      } else if (char === ':') {
        // The last string was a key
        if (this.lastString !== null) {
          this.lastJsonKey = this.lastString;
          this.lastString = null;

          // Check if we're tracking this field in arguments
          if (
            this.currentObject &&
            this.currentObject.inArguments &&
            this.currentObject.name &&
            this.depth === this.currentObject.keyDepth &&
            this.matchesTrackedPair(this.currentObject.name, this.lastJsonKey)
          ) {
            this.currentObject.currentKey = this.lastJsonKey;
          }
        }
      }
    }
  }

  /**
   * Finalizes parsing and yields any remaining complete objects
   */
  public *finalize(): Generator<{ json: string; index: number }> {
    // If we have a partial tool call object at the end, try to fix and yield it
    if (this.objectStartIndex !== -1) {
      const partialJson = this.buffer.substring(this.objectStartIndex);
      try {
        const fixedJson = fixJson(partialJson);
        // Verify it's valid JSON before yielding
        JSON.parse(fixedJson);
        yield { json: fixedJson, index: this.yieldedCount };
        this.yieldedCount++;
      } catch {
        // If we can't fix it, just skip it
      }
    }

    // Memory cleanup: clear accumulated field values
    this.fieldValues.clear();
    this.entityKeys.clear();
  }

  /**
   * Gets the total count of objects yielded
   */
  public getYieldedCount(): number {
    return this.yieldedCount;
  }

  /**
   * Gets the current buffer content
   */
  public getBuffer(): string {
    return this.buffer;
  }
}
