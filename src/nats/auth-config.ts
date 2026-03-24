import { existsSync } from 'fs';
import path from 'path';

export interface NatsAuthConfig {
  tlsConfig: {
    certFile: string;
    keyFile: string;
    caFile: string;
  };
  credentialsFile: string;
  serverUrls: string[];
}

const NATS_SERVER_URLS = [
  'nats://nats1.apex-sentinel.internal:4222',
  'nats://nats2.apex-sentinel.internal:4222',
  'nats://nats3.apex-sentinel.internal:4222',
  'nats://nats4.apex-sentinel.internal:4222',
  'nats://nats5.apex-sentinel.internal:4222',
];

export function buildAuthConfig(nodeId: string, certsDir: string): NatsAuthConfig {
  return {
    tlsConfig: {
      certFile: path.join(certsDir, `${nodeId}.crt`),
      keyFile: path.join(certsDir, `${nodeId}.key`),
      caFile: path.join(certsDir, 'ca.crt'),
    },
    credentialsFile: path.join(certsDir, `${nodeId}.creds`),
    serverUrls: getServerUrls(),
  };
}

export function validateCertPaths(config: NatsAuthConfig): { valid: boolean; missing: string[] } {
  const paths = [
    config.tlsConfig.certFile,
    config.tlsConfig.keyFile,
    config.tlsConfig.caFile,
    config.credentialsFile,
  ];

  const missing = paths.filter((p) => !existsSync(p));

  return {
    valid: missing.length === 0,
    missing,
  };
}

export function getServerUrls(): string[] {
  return [...NATS_SERVER_URLS];
}
