/**
 * Parse a free-text roster message into structured client rows.
 * One client per line. Everything after the first dash-like separator is
 * treated as task context. We accept —, –, -, or ":" as the separator.
 */
export function parseRoster(
  text: string
): { client_name: string; task_context: string | null }[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    // Strip leading bullets/numbering people often add.
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = line.match(/^(.*?)\s*[—–:-]\s*(.+)$/);
      if (match) {
        return {
          client_name: match[1].trim(),
          task_context: match[2].trim() || null,
        };
      }
      return { client_name: line, task_context: null };
    })
    .filter((c) => c.client_name.length > 0);
}
