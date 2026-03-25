// APEX-SENTINEL — W6 Edge Deployer
// FR-W6-07 | src/deploy/edge-deployer.ts
//
// ONNX model quantization + deployment manifests for edge devices.
// RPi4: INT8 quantization, <200ms inference, 512MB memory budget.
// Jetson Nano: FP16 quantization, CUDA, <50ms inference, 2GB memory budget.

export type DeviceType = 'rpi4' | 'jetson-nano' | 'x86-cpu';

export interface QuantizeResult {
  outputPath: string;
  sizeReductionPercent: number;
  precision: 'int8' | 'fp16' | 'fp32';
}

export interface DeploymentManifest {
  deviceType: DeviceType;
  modelPath: string;
  precision: 'int8' | 'fp16' | 'fp32';
  maxMemoryMB: number;
  inferenceLatencyMs: number;
  dependencies: string[];
}

export interface ValidationResult {
  valid: boolean;
  latencyMs: number;
  warnings: string[];
}

export interface OnnxRuntime {
  quantizeInt8: (modelPath: string, options: object) => Promise<QuantizeResult>;
  quantizeFp16: (modelPath: string, options: object) => Promise<QuantizeResult>;
  runInference: (modelPath: string, input?: unknown) => Promise<{ latencyMs: number; output: number[] }>;
  validateModel: (modelPath: string) => Promise<boolean>;
}

export class EdgeDeploymentError extends Error {
  public readonly diagnostic: string;
  constructor(message: string, diagnostic: string) {
    super(message);
    this.name = 'EdgeDeploymentError';
    this.diagnostic = diagnostic;
  }
}

const DEVICE_CONFIGS: Record<DeviceType, { precision: 'int8' | 'fp16' | 'fp32'; maxMemoryMB: number; maxLatencyMs: number; dependencies: string[] }> = {
  'rpi4': {
    precision: 'int8',
    maxMemoryMB: 512,
    maxLatencyMs: 200,
    dependencies: ['onnxruntime', 'numpy'],
  },
  'jetson-nano': {
    precision: 'fp16',
    maxMemoryMB: 2048,
    maxLatencyMs: 50,
    dependencies: ['onnxruntime-gpu', 'numpy', 'cuda-runtime'],
  },
  'x86-cpu': {
    precision: 'fp32',
    maxMemoryMB: 4096,
    maxLatencyMs: 100,
    dependencies: ['onnxruntime', 'numpy'],
  },
};

export class EdgeDeployer {
  private readonly runtime: OnnxRuntime;

  constructor(options: { onnxRuntime: OnnxRuntime }) {
    this.runtime = options.onnxRuntime;
  }

  async quantize(modelPath: string, deviceType: DeviceType): Promise<QuantizeResult> {
    const cfg = DEVICE_CONFIGS[deviceType];
    if (cfg.precision === 'int8') {
      return this.runtime.quantizeInt8(modelPath, { deviceType });
    } else if (cfg.precision === 'fp16') {
      return this.runtime.quantizeFp16(modelPath, { deviceType });
    } else {
      // FP32 — no quantization needed, return identity result
      return {
        outputPath: modelPath.replace(/\.onnx$/, '_fp32.onnx'),
        sizeReductionPercent: 0,
        precision: 'fp32',
      };
    }
  }

  createManifest(deviceType: DeviceType, modelPath: string): DeploymentManifest {
    const cfg = DEVICE_CONFIGS[deviceType];
    return {
      deviceType,
      modelPath,
      precision: cfg.precision,
      maxMemoryMB: cfg.maxMemoryMB,
      inferenceLatencyMs: cfg.maxLatencyMs,
      dependencies: [...cfg.dependencies],
    };
  }

  async validateDeployment(modelPath: string, deviceType: DeviceType): Promise<ValidationResult> {
    const isValid = await this.runtime.validateModel(modelPath);
    if (!isValid) {
      throw new EdgeDeploymentError(
        `Model validation failed: ${modelPath}`,
        `ONNX model at '${modelPath}' failed validation check. Ensure the file is a valid ONNX model exported with opset ≥ 14.`
      );
    }

    const inference = await this.runtime.runInference(modelPath);
    const cfg = DEVICE_CONFIGS[deviceType];
    const warnings: string[] = [];

    if (inference.latencyMs > cfg.maxLatencyMs) {
      warnings.push(`latency`);
    }

    return {
      valid: warnings.length === 0,
      latencyMs: inference.latencyMs,
      warnings,
    };
  }
}
