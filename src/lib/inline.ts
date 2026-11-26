// Turn `[words](/path/)` into links in short, author-written strings
// (news items). Everything else is escaped.
const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function inlineLinks(text: string) {
  return escape(text).replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
}
