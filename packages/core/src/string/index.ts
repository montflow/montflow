/**
 * Capitalizes the first letter of each word in a given string.
 *
 * @param {string} str The input string to capitalize.
 * @returns {string} The capitalized string.
 *
 * @example
 * capitalize("hello world"); // Returns: "Hello World"
 */
export function capitalize(str: string): string {
  return str
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
