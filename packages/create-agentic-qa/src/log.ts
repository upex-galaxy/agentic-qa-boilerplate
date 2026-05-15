const isTTY = process.stdout.isTTY;

const C = {
  reset: isTTY ? '\x1B[0m' : '',
  dim: isTTY ? '\x1B[2m' : '',
  bold: isTTY ? '\x1B[1m' : '',
  cyan: isTTY ? '\x1B[36m' : '',
  green: isTTY ? '\x1B[32m' : '',
  yellow: isTTY ? '\x1B[33m' : '',
  red: isTTY ? '\x1B[31m' : '',
};

export const log = {
  info: (msg: string) => process.stdout.write(`${C.cyan}ℹ${C.reset} ${msg}\n`),
  success: (msg: string) => process.stdout.write(`${C.green}✓${C.reset} ${msg}\n`),
  warn: (msg: string) => process.stdout.write(`${C.yellow}⚠${C.reset} ${msg}\n`),
  error: (msg: string) => process.stderr.write(`${C.red}✗${C.reset} ${msg}\n`),
  step: (n: number, total: number, title: string) =>
    process.stdout.write(`\n${C.bold}[${n}/${total}] ${title}${C.reset}\n`),
  banner: (msg: string) =>
    process.stdout.write(`\n${C.bold}${C.cyan}${msg}${C.reset}\n\n`),
  dim: (msg: string) => process.stdout.write(`${C.dim}${msg}${C.reset}\n`),
  raw: (msg: string) => process.stdout.write(msg),
};
