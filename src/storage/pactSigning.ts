// Copyright © 2026 PACTResearch.net. All rights reserved.
// Local .pact signing — runs entirely on this machine, no network involved.
// Replaces the retired sign.pactresearch.net server.
import { sign as cryptoSign, verify as cryptoVerify, generateKeyPairSync } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { Buffer } from "buffer";
import * as path from "path";
import * as os from "os";
import type { PactExport, SignedPactExport, VerifyResult } from "./notebookStore";

const KEY_DIR = path.join(os.homedir(), ".pact-keys");
const KEY_PATH = path.join(KEY_DIR, "private.pem");
const PUB_PATH = path.join(KEY_DIR, "public.pem");

function ensureKeys(): void {
  if (!existsSync(KEY_DIR)) {
    mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  }
  if (!existsSync(KEY_PATH)) {
    console.log("PACT signing: generating local Ed25519 key pair at", KEY_DIR);
    const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    writeFileSync(KEY_PATH, privateKey, { mode: 0o600 });
    writeFileSync(PUB_PATH, publicKey, { mode: 0o644 });
    console.log("PACT signing: key pair generated and saved.");
  }
}

function getPrivateKey(): string {
  ensureKeys();
  return readFileSync(KEY_PATH, "utf8");
}

function getPublicKey(): string {
  ensureKeys();
  return readFileSync(PUB_PATH, "utf8");
}

// ── Canonical Serialization ──────────────────────────────────────────────────
// Deterministic JSON — sorted keys, no whitespace.
// Prevents signature invalidation from key reordering or formatting changes.
function canonicalize(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalize).join(",") + "]";
  }
  const sorted = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = sorted.map(k =>
    `${JSON.stringify(k)}:${canonicalize((obj as Record<string, unknown>)[k])}`
  );
  return "{" + pairs.join(",") + "}";
}

// ── Sign / Verify ─────────────────────────────────────────────────────────────
// IMPORTANT: Ed25519 keys determine their own digest algorithm internally.
// crypto.createSign("SHA256") THROWS at runtime for Ed25519 keys — this is
// the bug that existed in the old signing server. The one-shot crypto.sign()/
// crypto.verify() API with a `null` algorithm argument is required instead.

export function signPact(payload: PactExport): SignedPactExport {
  const canonical = canonicalize(payload);
  const signature = cryptoSign(null, Buffer.from(canonical), getPrivateKey()).toString("hex");

  return {
    version: 1,
    signedAt: Date.now(),
    signer: "pact-local",
    signature,
    payload,
  };
}

export function verifyPact(signed: SignedPactExport): VerifyResult {
  try {
    const canonical = canonicalize(signed.payload);
    const valid = cryptoVerify(
      null,
      Buffer.from(canonical),
      getPublicKey(),
      Buffer.from(signed.signature, "hex"),
    );
    return {
      valid,
      reason: valid ? null : "Signature mismatch — notebook may have been tampered with",
    };
  } catch (e: any) {
    return { valid: false, reason: e.message };
  }
}

export function getPublicKeyPem(): string {
  return getPublicKey();
}
