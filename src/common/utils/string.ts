/**
 * Checks if text is primarily Latin script based on the ratio of Latin letters
 * Includes accented Latin letters (é, è, ê, ë, etc.)
 * @param str The text to check
 * @param threshold Minimum ratio of Latin letters (0-1), default 0.7
 * @returns True if text is primarily Latin script
 */
export function isLatinText(str: string, threshold: number = 0.7): boolean {
  if (!str || str.length === 0) {
    return true; // Empty string defaults to Latin
  }

  // Count Latin letters including accented characters
  // Basic Latin (A-Z, a-z) + Latin-1 Supplement (À-ÿ) + Latin Extended-A (Ā-ž) + Latin Extended-B + Latin Extended Additional
  // Using Unicode property escapes to match all Latin script letters
  const latinLetterPattern = /\p{Script=Latin}/gu;
  const latinMatches = str.match(latinLetterPattern);
  const latinLetterCount = latinMatches ? latinMatches.length : 0;

  // Calculate ratio of Latin letters
  const ratio = latinLetterCount / str.length;

  return ratio >= threshold;
}

/**
 * Truncates text to a maximum length, adding a truncation message if needed
 * @param str The text to truncate
 * @param maxLength The maximum allowed length
 * @returns Object with truncated text, truncation status, and actual cut characters
 */
export function truncateString(
  str: string,
  maxLength: number
): {
  text: string;
  wasTruncated: boolean;
  cutChars: number;
} {
  if (str.length <= maxLength) {
    return {
      text: str,
      wasTruncated: false,
      cutChars: 0,
    };
  }

  // Calculate the actual cut characters by working backwards from maxLength
  // We need to account for the truncation message length
  const baseTruncationMsg = '\n[TRUNCATED: ';
  const truncationSuffix = ' chars cut]';

  // Estimate the number of digits needed for the cut count
  const estimatedCutChars = str.length - maxLength;
  const estimatedDigits = estimatedCutChars.toString().length;
  const estimatedTruncationMsgLength =
    baseTruncationMsg.length + estimatedDigits + truncationSuffix.length;

  // Calculate available space for actual text
  let availableLength = maxLength - estimatedTruncationMsgLength;

  // If no space available for text, just truncate to maxLength without message
  if (availableLength <= 0) {
    return {
      text: str.substring(0, maxLength),
      wasTruncated: true,
      cutChars: str.length - maxLength,
    };
  }

  // Calculate actual cut characters
  const actualCutChars = str.length - availableLength;

  // Check if our digit estimation was correct
  const actualDigits = actualCutChars.toString().length;
  if (actualDigits !== estimatedDigits) {
    // Recalculate with correct digit count
    const actualTruncationMsgLength =
      baseTruncationMsg.length + actualDigits + truncationSuffix.length;
    availableLength = maxLength - actualTruncationMsgLength;

    if (availableLength <= 0) {
      return {
        text: str.substring(0, maxLength),
        wasTruncated: true,
        cutChars: str.length - maxLength,
      };
    }
  }

  // Final calculation
  const finalCutChars = str.length - availableLength;
  const truncationMsg = `${baseTruncationMsg}${finalCutChars}${truncationSuffix}`;

  return {
    text: str.substring(0, availableLength) + truncationMsg,
    wasTruncated: true,
    cutChars: finalCutChars,
  };
}
