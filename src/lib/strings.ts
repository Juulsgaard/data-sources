
export function lowerFirst<T extends string>(str: T): Uncapitalize<T> {
  if (!str) return str as Uncapitalize<T>;
  return str[0].toLowerCase() + str.substring(1) as Uncapitalize<T>;
}

function upperFirst<T extends string>(str: T) {
  if (!str) return str as Capitalize<T>;
  return str[0].toUpperCase() + str.substring(1) as Capitalize<T>;
}

export function toTitleCase(str: string) {
  if (!str) return str;

  return upperFirst(
    str.trim()
      .replace(/[-\s]+(\w)/g, (_, c) => ` ${c.toUpperCase()}`)
      .replace(/(\w)([A-Z])/g, (_, a, b) => `${a} ${b}`)
  );
}
