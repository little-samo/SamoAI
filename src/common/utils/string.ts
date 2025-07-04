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
