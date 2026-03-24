export interface NatsStreamConfig {
  name: string;
  subjects: string[];
  storage: 'file' | 'memory';
  retention: 'limits' | 'workqueue' | 'interest';
  maxAge: number; // seconds
  replicas: number;
  maxMsgSize: number; // bytes
  dedupWindow: number; // seconds
}

const STREAM_CONFIGS: NatsStreamConfig[] = [
  {
    name: 'DETECTIONS',
    subjects: ['sentinel.detections.>'],
    storage: 'file',
    retention: 'limits',
    maxAge: 86400, // 24 hours
    replicas: 3,
    maxMsgSize: 1048576, // 1 MiB
    dedupWindow: 30,
  },
  {
    name: 'NODE_HEALTH',
    subjects: ['sentinel.health.>'],
    storage: 'file',
    retention: 'limits',
    maxAge: 300, // 5 minutes
    replicas: 3,
    maxMsgSize: 65536, // 64 KiB
    dedupWindow: 10,
  },
  {
    name: 'ALERTS',
    subjects: ['sentinel.alerts.>'],
    storage: 'file',
    retention: 'limits',
    maxAge: 604800, // 7 days
    replicas: 5,
    maxMsgSize: 524288, // 512 KiB
    dedupWindow: 60,
  },
  {
    name: 'COT_EVENTS',
    subjects: ['sentinel.cot.>'],
    storage: 'file',
    retention: 'limits',
    maxAge: 3600, // 1 hour
    replicas: 3,
    maxMsgSize: 262144, // 256 KiB
    dedupWindow: 15,
  },
];

export function getStreamConfigs(): NatsStreamConfig[] {
  return STREAM_CONFIGS;
}

export function getStreamConfig(name: string): NatsStreamConfig {
  const config = STREAM_CONFIGS.find((c) => c.name === name);
  if (!config) {
    throw new Error(`Unknown stream: ${name}`);
  }
  return config;
}

export function validateSubject(subject: string): boolean {
  if (!subject || subject.length === 0) {
    return false;
  }
  if (subject.endsWith('.')) {
    return false;
  }
  if (subject.includes('..')) {
    return false;
  }
  return true;
}
