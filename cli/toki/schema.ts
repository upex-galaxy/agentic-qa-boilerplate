/**
 * WokiToki (`toki`) - Schema + runtime validation.
 *
 * Single source of truth for the data contract between the AI (which writes a
 * spec) and the browser UI (which returns a result). Hand-rolled validation,
 * zero external deps - Bun built-ins only so this stays extractable.
 */

// ============================================================================
// SPEC TYPES (input - the AI writes it)
// ============================================================================

export type ControlType = 'single' | 'multi' | 'toggle';

export interface ControlOption {
  value: string
  label: string
}

export interface Controls {
  type: ControlType
  options?: ControlOption[]
  required?: boolean
}

export interface TextField {
  required: boolean
  placeholder?: string
}

export interface Block {
  id: string
  content: string
  controls?: Controls
  text?: TextField
}

export interface Spec {
  title: string
  intro?: string
  submitLabel?: string
  blocks: Block[]
}

// ============================================================================
// NORMALIZED SPEC TYPES (output of validateSpec - downstream depends on this)
// ============================================================================

/**
 * Normalized controls: `required` is always a concrete boolean. For
 * `single`/`multi`, `options` is guaranteed present + non-empty. For `toggle`,
 * `options` is omitted.
 */
export interface NormalizedControls {
  type: ControlType
  options?: ControlOption[]
  required: boolean
}

/** Normalized text field: `required` is always a concrete boolean. */
export interface NormalizedTextField {
  required: boolean
  placeholder?: string
}

/**
 * Normalized block: `text` is ALWAYS present (defaulted to
 * `{ required: false }`), `submitLabel` defaulted at the spec level.
 */
export interface NormalizedBlock {
  id: string
  content: string
  controls?: NormalizedControls
  text: NormalizedTextField
}

/**
 * Normalized spec returned by `validateSpec`. `submitLabel` is always present
 * (default `'Submit'`) and every block carries a `text` field.
 */
export interface NormalizedSpec {
  title: string
  intro?: string
  submitLabel: string
  blocks: NormalizedBlock[]
}

// ============================================================================
// RESULT TYPES (output - JSON to stdout + .toki/result-<id>.json)
// ============================================================================

export interface ResultBlock {
  id: string
  controlAnswer: string | string[] | boolean | null
  text: string
  quotes: string[]
}

export interface Result {
  submittedAt: string
  blocks: ResultBlock[]
  meta: {
    answered: number
    total: number
  }
}

// ============================================================================
// ERROR
// ============================================================================

/**
 * Thrown by `validateSpec` on any contract violation. `path` names the
 * offending location (e.g. `blocks[2].id`, `blocks[0].controls.type`) so
 * callers can surface a precise message and choose exit code 2.
 */
export class SpecError extends Error {
  readonly path: string;

  constructor(message: string, path: string) {
    super(message);
    this.name = 'SpecError';
    this.path = path;
  }
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

const CONTROL_TYPES: readonly ControlType[] = ['single', 'multi', 'toggle'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate + normalize a raw spec (typically `JSON.parse` output).
 *
 * Returns a fully normalized `NormalizedSpec`: `submitLabel` defaulted to
 * `'Submit'`, every block carries a concrete `text` field, and every present
 * `controls.required` is a boolean. Throws `SpecError` (with a `path`) on the
 * first violation.
 */
export function validateSpec(raw: unknown): NormalizedSpec {
  if (!isPlainObject(raw)) {
    throw new SpecError('Spec must be a plain object.', 'spec');
  }

  if (!isNonEmptyString(raw.title)) {
    throw new SpecError('Spec "title" must be a non-empty string.', 'title');
  }

  if (raw.intro !== undefined && typeof raw.intro !== 'string') {
    throw new SpecError('Spec "intro" must be a string when present.', 'intro');
  }

  if (raw.submitLabel !== undefined && typeof raw.submitLabel !== 'string') {
    throw new SpecError(
      'Spec "submitLabel" must be a string when present.',
      'submitLabel',
    );
  }

  if (!Array.isArray(raw.blocks)) {
    throw new SpecError('Spec "blocks" must be an array.', 'blocks');
  }

  if (raw.blocks.length === 0) {
    throw new SpecError('Spec "blocks" must be a non-empty array.', 'blocks');
  }

  const seenBlockIds = new Set<string>();
  const blocks: NormalizedBlock[] = raw.blocks.map((rawBlock, index) =>
    normalizeBlock(rawBlock, index, seenBlockIds),
  );

  const submitLabel = isNonEmptyString(raw.submitLabel)
    ? raw.submitLabel
    : 'Submit';

  const normalized: NormalizedSpec = {
    title: raw.title,
    submitLabel,
    blocks,
  };

  if (typeof raw.intro === 'string') {
    normalized.intro = raw.intro;
  }

  return normalized;
}

function normalizeBlock(
  rawBlock: unknown,
  index: number,
  seenBlockIds: Set<string>,
): NormalizedBlock {
  const where = `blocks[${index}]`;

  if (!isPlainObject(rawBlock)) {
    throw new SpecError(`${where} must be a plain object.`, where);
  }

  if (!isNonEmptyString(rawBlock.id)) {
    throw new SpecError(`${where}.id must be a non-empty string.`, `${where}.id`);
  }

  const id = rawBlock.id;

  if (seenBlockIds.has(id)) {
    throw new SpecError(
      `${where}.id "${id}" is duplicated; every block id must be unique.`,
      `${where}.id`,
    );
  }
  seenBlockIds.add(id);

  if (typeof rawBlock.content !== 'string') {
    throw new SpecError(
      `${where} (id "${id}") "content" must be a string.`,
      `${where}.content`,
    );
  }

  const block: NormalizedBlock = {
    id,
    content: rawBlock.content,
    text: normalizeText(rawBlock.text, index, id),
  };

  if (rawBlock.controls !== undefined) {
    block.controls = normalizeControls(rawBlock.controls, index, id);
  }

  return block;
}

function normalizeControls(
  rawControls: unknown,
  index: number,
  id: string,
): NormalizedControls {
  const where = `blocks[${index}].controls`;

  if (!isPlainObject(rawControls)) {
    throw new SpecError(
      `${where} (block "${id}") must be a plain object when present.`,
      where,
    );
  }

  const { type } = rawControls;
  if (typeof type !== 'string' || !CONTROL_TYPES.includes(type as ControlType)) {
    throw new SpecError(
      `${where}.type (block "${id}") must be one of: single, multi, toggle.`,
      `${where}.type`,
    );
  }

  const controlType = type as ControlType;

  if (rawControls.required !== undefined && typeof rawControls.required !== 'boolean') {
    throw new SpecError(
      `${where}.required (block "${id}") must be a boolean when present.`,
      `${where}.required`,
    );
  }
  const required = rawControls.required === true;

  if (controlType === 'toggle') {
    if (rawControls.options !== undefined) {
      throw new SpecError(
        `${where}.options (block "${id}") must be absent for type "toggle".`,
        `${where}.options`,
      );
    }
    return { type: controlType, required };
  }

  // single | multi -> require a non-empty options[] with unique non-empty values.
  const options = normalizeOptions(rawControls.options, index, id);
  return { type: controlType, options, required };
}

function normalizeOptions(
  rawOptions: unknown,
  index: number,
  id: string,
): ControlOption[] {
  const where = `blocks[${index}].controls.options`;

  if (!Array.isArray(rawOptions) || rawOptions.length === 0) {
    throw new SpecError(
      `${where} (block "${id}") must be a non-empty array for single/multi controls.`,
      where,
    );
  }

  const seenValues = new Set<string>();
  const options: ControlOption[] = rawOptions.map((rawOption, optionIndex) => {
    const optionWhere = `${where}[${optionIndex}]`;

    if (!isPlainObject(rawOption)) {
      throw new SpecError(
        `${optionWhere} (block "${id}") must be an object.`,
        optionWhere,
      );
    }

    if (!isNonEmptyString(rawOption.value)) {
      throw new SpecError(
        `${optionWhere}.value (block "${id}") must be a non-empty string.`,
        `${optionWhere}.value`,
      );
    }

    if (!isNonEmptyString(rawOption.label)) {
      throw new SpecError(
        `${optionWhere}.label (block "${id}") must be a non-empty string.`,
        `${optionWhere}.label`,
      );
    }

    if (seenValues.has(rawOption.value)) {
      throw new SpecError(
        `${optionWhere}.value "${rawOption.value}" (block "${id}") is duplicated; option values must be unique within a block.`,
        `${optionWhere}.value`,
      );
    }
    seenValues.add(rawOption.value);

    return { value: rawOption.value, label: rawOption.label };
  });

  return options;
}

function normalizeText(
  rawText: unknown,
  index: number,
  id: string,
): NormalizedTextField {
  const where = `blocks[${index}].text`;

  if (rawText === undefined) {
    return { required: false };
  }

  if (!isPlainObject(rawText)) {
    throw new SpecError(
      `${where} (block "${id}") must be a plain object when present.`,
      where,
    );
  }

  if (rawText.required !== undefined && typeof rawText.required !== 'boolean') {
    throw new SpecError(
      `${where}.required (block "${id}") must be a boolean when present.`,
      `${where}.required`,
    );
  }

  if (rawText.placeholder !== undefined && typeof rawText.placeholder !== 'string') {
    throw new SpecError(
      `${where}.placeholder (block "${id}") must be a string when present.`,
      `${where}.placeholder`,
    );
  }

  const text: NormalizedTextField = { required: rawText.required === true };
  if (typeof rawText.placeholder === 'string') {
    text.placeholder = rawText.placeholder;
  }

  return text;
}
