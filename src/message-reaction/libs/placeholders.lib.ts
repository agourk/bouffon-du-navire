type AppendableToString = string | number | boolean | { toString(): string } | (() => AppendableToString);

export class PlaceholdersLib {
  public static parsePlaceholders(text: string, replacements: Map<string, AppendableToString>) {
    text = text.replace(/%\w+%/g, (match) => {
      const placeholder = match.slice(1, -1);
      const replacement = replacements.get(placeholder);
      if (replacement === undefined) {
        return "";
      } else {
        return String(replacement instanceof Function ? replacement() : replacement);
      }
    });
    return text;
  }
}
