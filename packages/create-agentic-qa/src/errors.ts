export type ErrorCode
  = | 'USAGE'
    | 'ENVIRONMENT'
    | 'NETWORK'
    | 'CONFLICT'
    | 'BOOTSTRAP'
    | 'INSTALL'
    | 'SETUP'
    | 'CANCEL';

const EXIT_CODES: Record<ErrorCode, number> = {
  USAGE: 2,
  ENVIRONMENT: 10,
  NETWORK: 11,
  CONFLICT: 12,
  BOOTSTRAP: 20,
  INSTALL: 30,
  SETUP: 31,
  CANCEL: 130,
};

export class CliError extends Error {
  readonly code: ErrorCode;
  readonly hint?: string;

  constructor(code: ErrorCode, message: string, hint?: string) {
    super(message);
    this.code = code;
    this.hint = hint;
    this.name = 'CliError';
  }

  get exitCode(): number {
    return EXIT_CODES[this.code];
  }
}
