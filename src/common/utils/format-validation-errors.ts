import type { ValidationError } from 'class-validator';

/**
 * class-validator evaluates every decorator on a property independently, so a
 * property that was simply never sent fails its presence, type, AND
 * length/range rules all at once. For `fullName` that produces four messages:
 *
 *   fullName must be shorter than or equal to 100 characters
 *   fullName must be longer than or equal to 2 characters
 *   fullName must be a string
 *   fullName should not be empty
 *
 * The set is also unordered — it follows decorator evaluation order, which is
 * bottom-up — so the message a client displays first is arbitrary. That is how
 * a missing field ends up reported as "must be shorter than or equal to 100
 * characters", which tells the user nothing true about what they did wrong.
 *
 * This module collapses each property to the single most explanatory message:
 * a missing value is reported as missing, a wrong type as a wrong type, and
 * only a present, correctly-typed value is judged against length/range rules.
 */

/** Constraints asserting the value was supplied at all. */
const PRESENCE_CONSTRAINTS = new Set([
  'isDefined',
  'isNotEmpty',
  'isNotEmptyObject',
  'arrayNotEmpty',
]);

/**
 * Constraints that only make sense once a value is present and correctly
 * typed. This set is deliberately the *demoted* one rather than an inventory
 * of every type constraint: length/range rules are a small, closed set, while
 * type rules are an open-ended tail (`isUuid`, `isLatLong`, custom validators,
 * ...). Enumerating the tail means a newly added decorator silently ranks as
 * least explanatory; enumerating the demotions means it correctly outranks
 * length/range by default.
 */
const RANGE_CONSTRAINTS = new Set([
  'maxLength',
  'minLength',
  'length',
  'max',
  'min',
  'arrayMaxSize',
  'arrayMinSize',
  'matches',
]);

/** Emitted by `forbidNonWhitelisted` for a property the DTO does not declare. */
const WHITELIST_CONSTRAINT = 'whitelistValidation';

/** Lower wins: presence before shape, shape before length/range. */
function priorityOf(constraint: string): number {
  if (PRESENCE_CONSTRAINTS.has(constraint)) return 0;
  if (RANGE_CONSTRAINTS.has(constraint)) return 2;
  return 1;
}

/**
 * Flattens a class-validator error tree into one message per failing property,
 * ordered by DTO property order. Nested properties are prefixed with their
 * path (e.g. `workPreferences.noticePeriodDays: ...`) so the client can tell
 * which field a message belongs to.
 */
export function formatValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): string[] {
  return errors.flatMap((error) => {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    const own = bestMessageFor(error, path, Boolean(parentPath));
    const nested = error.children?.length
      ? formatValidationErrors(error.children, path)
      : [];

    return own ? [own, ...nested] : nested;
  });
}

function bestMessageFor(
  error: ValidationError,
  path: string,
  isNested: boolean,
): string | null {
  const constraints = error.constraints;
  if (!constraints) {
    return null;
  }

  const entries = Object.entries(constraints);
  if (entries.length === 0) {
    return null;
  }

  // A value that is absent (or null) and failed a presence or shape rule is
  // missing, full stop — reporting it as a length violation is misleading.
  // `whitelistValidation` is excluded so a forbidden property explicitly sent
  // as null still gets its own "should not exist" message.
  const isMissing =
    (error.value === undefined || error.value === null) &&
    entries.some(
      ([constraint]) =>
        constraint !== WHITELIST_CONSTRAINT &&
        !RANGE_CONSTRAINTS.has(constraint),
    );

  if (isMissing) {
    return `${path} is required`;
  }

  const [, message] = entries.sort(
    ([a], [b]) => priorityOf(a) - priorityOf(b),
  )[0];

  // class-validator builds messages from the leaf property name, which loses
  // the location of a nested field — prefix the full path back on.
  return isNested ? `${path}: ${message}` : message;
}
