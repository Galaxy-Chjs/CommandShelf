/**
 * Template variables.
 *
 * A piece of content may contain placeholders:
 *
 *   ssh -L {{local_port}}:localhost:{{remote_port}} {{server=user@10.0.0.12}}
 *
 * `{{name}}` has no default; `{{name=default}}` does. Everything here is a pure
 * function so the rules are cheap to test and identical in both processes.
 */

/**
 * Placeholder names allow Unicode letters and digits (so `{{文件名}}` works
 * alongside `{{server}}`), plus `_`, `-` and `.`.
 *
 * Built fresh on every call: a shared `/g` regex carries `lastIndex` between
 * calls, which makes `matchAll` / `test` results depend on call order.
 */
function placeholder(): RegExp {
  return /\{\{\s*([\p{L}\p{N}_.-]+)\s*(?:=([^}]*))?\}\}/gu
}

export interface TemplateVariable {
  name: string
  /** Empty string when the placeholder carried no default. */
  defaultValue: string
  /** Whether the placeholder was written as `{{name=...}}`. */
  hasDefault: boolean
}

/**
 * Lists the variables of a template in order of first appearance.
 * Repeated names are reported once; the first default wins.
 *
 * Malformed placeholders (`{{}}`, `{{=x}}`, an unclosed `{{`) are left alone
 * rather than treated as errors — a half-written command should still be
 * storable and copyable.
 */
export function parseTemplate(body: string): TemplateVariable[] {
  const found = new Map<string, TemplateVariable>()
  for (const match of body.matchAll(placeholder())) {
    const name = match[1]
    if (!name || found.has(name)) continue
    const rawDefault = match[2]
    found.set(name, {
      name,
      defaultValue: rawDefault === undefined ? '' : rawDefault.trim(),
      hasDefault: rawDefault !== undefined,
    })
  }
  return [...found.values()]
}

export function variableNames(body: string): string[] {
  return parseTemplate(body).map((variable) => variable.name)
}

export function hasVariables(body: string): boolean {
  return placeholder().test(body)
}

/**
 * Substitutes `values` into the template.
 *
 * A name that is absent from `values` keeps its original placeholder, so a
 * partially filled template never silently loses information. A name present
 * with an empty string is substituted as empty — the caller decides whether
 * that is allowed (the quick panel blocks it).
 */
export function fillTemplate(body: string, values: Readonly<Record<string, string>>): string {
  return body.replace(placeholder(), (whole, name: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) return whole
    return values[name] ?? ''
  })
}

/** Seeds the editor with each variable's default value. */
export function defaultValues(body: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const variable of parseTemplate(body)) values[variable.name] = variable.defaultValue
  return values
}

/** Names that still have no usable value. */
export function missingVariables(body: string, values: Readonly<Record<string, string>>): string[] {
  return parseTemplate(body)
    .filter((variable) => !(values[variable.name] ?? '').trim())
    .map((variable) => variable.name)
}

/** True when every variable has a non-blank value. */
export function isTemplateComplete(
  body: string,
  values: Readonly<Record<string, string>>,
): boolean {
  return missingVariables(body, values).length === 0
}

/**
 * A one-line description of a variable for the fill-in form, e.g.
 * `server（默认 user@10.0.0.12）`.
 */
export function describeVariable(variable: TemplateVariable): string {
  if (variable.hasDefault && variable.defaultValue) {
    return `${variable.name}（默认 ${variable.defaultValue}）`
  }
  return variable.name
}

export type TemplateSegment =
  | { type: 'text'; value: string }
  | { type: 'variable'; name: string; defaultValue: string; hasDefault: boolean }

/**
 * Splits a template into literal text and variable placeholders.
 *
 * The renderer needs this to draw variables as chips instead of raw `{{x}}`
 * text. Highlighting happens per text segment, so a syntax highlighter never
 * sees the placeholders and cannot mangle them.
 */
export function splitTemplate(body: string): TemplateSegment[] {
  const segments: TemplateSegment[] = []
  let cursor = 0

  for (const match of body.matchAll(placeholder())) {
    const index = match.index ?? 0
    const name = match[1]
    if (!name) continue

    if (index > cursor) segments.push({ type: 'text', value: body.slice(cursor, index) })
    const rawDefault = match[2]
    segments.push({
      type: 'variable',
      name,
      defaultValue: rawDefault === undefined ? '' : rawDefault.trim(),
      hasDefault: rawDefault !== undefined,
    })
    cursor = index + match[0].length
  }

  if (cursor < body.length) segments.push({ type: 'text', value: body.slice(cursor) })
  return segments
}
