#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { Keypair, PublicKey } from '@solana/web3.js';

import { LN_USDT_ESCROW_PROGRAM_ID } from '../src/solana/lnUsdtEscrowClient.js';

const execFileP = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const programDir = path.join(repoRoot, 'solana/ln_usdt_escrow');
const defaultSoPath = path.join(programDir, 'target/deploy/ln_usdt_escrow.so');

function die(msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}

function usage() {
  return `
solprogctl (Solana program build/deploy helper)

Commands:
  id
  build
  deploy --rpc-url <url> --payer <keypair.json> --program-keypair <keypair.json> [--upgrade-authority <keypair.json>] [--so <path>] [--dry-run 0|1]
  keypair-pubkey --program-keypair <keypair.json>

Notes:
  - Program source: solana/ln_usdt_escrow
  - Default .so output: solana/ln_usdt_escrow/target/deploy/ln_usdt_escrow.so
  - Store keypairs under onchain/ (gitignored). Do NOT commit secrets.
`.trim();
}

function parseArgs(argv) {
  const args = [];
  const flags = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) flags.set(key, true);
      else {
        flags.set(key, next);
        i += 1;
      }
    } else {
      args.push(a);
    }
  }
  return { args, flags };
}

function requireFlag(flags, name) {
  const v = flags.get(name);
  if (!v || v === true) die(`Missing --${name}`);
  return String(v);
}

function parseBool(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (value === true) return true;
  const s = String(value).trim().toLowerCase();
  if (!s) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(s);
}

function readKeypairFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  let arr;
  try {
    arr = JSON.parse(String(raw || '').trim());
  } catch (_e) {
    die(`Invalid keypair JSON: ${filePath}`);
  }
  if (!Array.isArray(arr)) die(`Invalid keypair JSON (expected array): ${filePath}`);
  const bytes = Uint8Array.from(arr);
  return Keypair.fromSecretKey(bytes);
}

async function run(cmd, args, opts = {}) {
  const { stdout, stderr } = await execFileP(cmd, args, {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024 * 50,
    ...opts,
  });
  return { stdout: String(stdout || ''), stderr: String(stderr || '') };
}

async function main() {
  const { args, flags } = parseArgs(process.argv.slice(2));
  const cmd = args[0] || '';

  if (!cmd || cmd === 'help' || cmd === '--help') {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  if (cmd === 'id') {
    process.stdout.write(
      `${JSON.stringify({ type: 'program_id', program_id: LN_USDT_ESCROW_PROGRAM_ID.toBase58() }, null, 2)}\n`
    );
    return;
  }

  if (cmd === 'keypair-pubkey') {
    const programKeypairPath = requireFlag(flags, 'program-keypair');
    const kp = readKeypairFile(programKeypairPath);
    process.stdout.write(
      `${JSON.stringify(
        {
          type: 'program_keypair',
          program_keypair: programKeypairPath,
          program_id: kp.publicKey.toBase58(),
          matches_default: kp.publicKey.equals(LN_USDT_ESCROW_PROGRAM_ID),
        },
        null,
        2
      )}\n`
    );
    return;
  }

  if (cmd === 'build') {
    await run('cargo', ['build-sbf'], { cwd: programDir });
    process.stdout.write(
      `${JSON.stringify(
        { type: 'built', program_id: LN_USDT_ESCROW_PROGRAM_ID.toBase58(), so_path: defaultSoPath },
        null,
        2
      )}\n`
    );
    return;
  }

  if (cmd === 'deploy') {
    const rpcUrl = requireFlag(flags, 'rpc-url').trim();
    const payerPath = requireFlag(flags, 'payer').trim();
    const programKeypairPath = requireFlag(flags, 'program-keypair').trim();
    const upgradeAuthorityPath = (flags.get('upgrade-authority') && String(flags.get('upgrade-authority')).trim()) || payerPath;
    const soPath = (flags.get('so') && String(flags.get('so')).trim()) || defaultSoPath;
    const dryRun = parseBool(flags.get('dry-run'), false);

    if (!fs.existsSync(soPath)) {
      await run('cargo', ['build-sbf'], { cwd: programDir });
    }

    const programKp = readKeypairFile(programKeypairPath);
    const programId = programKp.publicKey;

    const solanaArgs = [
      'program',
      'deploy',
      soPath,
      '--url',
      rpcUrl,
      '--keypair',
      payerPath,
      '--program-id',
      programKeypairPath,
      '--upgrade-authority',
      upgradeAuthorityPath,
    ];

    if (dryRun) {
      process.stdout.write(
        `${JSON.stringify(
          {
            type: 'deploy_dry_run',
            program_id: programId.toBase58(),
            so_path: soPath,
            cmd: ['solana', ...solanaArgs],
            matches_default: programId.equals(LN_USDT_ESCROW_PROGRAM_ID),
          },
          null,
          2
        )}\n`
      );
      return;
    }

    const res = await run('solana', solanaArgs);
    process.stdout.write(
      `${JSON.stringify(
        {
          type: 'deployed',
          program_id: programId.toBase58(),
          so_path: soPath,
          matches_default: programId.equals(LN_USDT_ESCROW_PROGRAM_ID),
          stdout: res.stdout.trim(),
          stderr: res.stderr.trim(),
        },
        null,
        2
      )}\n`
    );
    return;
  }

  die(`Unknown command: ${cmd}`);
}

main().catch((err) => die(err?.stack || err?.message || String(err)));

