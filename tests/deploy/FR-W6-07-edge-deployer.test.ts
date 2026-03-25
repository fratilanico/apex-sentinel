// APEX-SENTINEL — W6 Edge Deployer Tests
// FR-W6-07 | tests/deploy/FR-W6-07-edge-deployer.test.ts
// ONNX quantization + deployment manifests for RPi4/Jetson Nano

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EdgeDeployer,
  EdgeDeploymentError,
} from '../../src/deploy/edge-deployer.js';
import type { DeviceType, DeploymentManifest } from '../../src/deploy/edge-deployer.js';

function makeMockOnnxRuntime(overrides: Record<string, unknown> = {}) {
  return {
    quantizeInt8: vi.fn().mockResolvedValue({ outputPath: '/tmp/model_int8.onnx', sizeReductionPercent: 62 }),
    quantizeFp16: vi.fn().mockResolvedValue({ outputPath: '/tmp/model_fp16.onnx', sizeReductionPercent: 45 }),
    runInference: vi.fn().mockResolvedValue({ latencyMs: 150, output: [0.1, 0.8, 0.1] }),
    validateModel: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('FR-W6-07: EdgeDeployer', () => {
  let deployer: EdgeDeployer;
  let mockRuntime: ReturnType<typeof makeMockOnnxRuntime>;

  beforeEach(() => {
    mockRuntime = makeMockOnnxRuntime();
    deployer = new EdgeDeployer({ onnxRuntime: mockRuntime });
  });

  // --- quantize ---

  it('FR-W6-07-01: GIVEN ONNX FP32 model, target "rpi4", WHEN quantize called, THEN returns INT8 model path + size reduction >50%', async () => {
    const result = await deployer.quantize('/models/yamnnet_fp32.onnx', 'rpi4');
    expect(result.outputPath).toContain('int8');
    expect(result.sizeReductionPercent).toBeGreaterThan(50);
    expect(mockRuntime.quantizeInt8).toHaveBeenCalledWith('/models/yamnnet_fp32.onnx', expect.any(Object));
  });

  it('FR-W6-07-02: GIVEN ONNX FP32 model, target "jetson-nano", WHEN quantize called, THEN uses FP16 quantization', async () => {
    await deployer.quantize('/models/yamnnet_fp32.onnx', 'jetson-nano');
    expect(mockRuntime.quantizeFp16).toHaveBeenCalled();
    expect(mockRuntime.quantizeInt8).not.toHaveBeenCalled();
  });

  it('FR-W6-07-03: GIVEN target "x86-cpu", WHEN quantize called, THEN returns FP32 (no quantization needed)', async () => {
    const result = await deployer.quantize('/models/yamnnet_fp32.onnx', 'x86-cpu');
    // x86-cpu doesn't need quantization — returns original or FP32 copy
    expect(result.outputPath).toBeTruthy();
  });

  // --- createManifest ---

  it('FR-W6-07-04: GIVEN target "rpi4", WHEN createManifest called, THEN returns manifest with INT8 precision + memory budget', () => {
    const manifest = deployer.createManifest('rpi4', '/models/model_int8.onnx');
    expect(manifest.deviceType).toBe('rpi4');
    expect(manifest.precision).toBe('int8');
    expect(manifest.maxMemoryMB).toBeLessThanOrEqual(512); // RPi4 constraint
    expect(manifest.inferenceLatencyMs).toBeLessThanOrEqual(200);
    expect(Array.isArray(manifest.dependencies)).toBe(true);
    expect(manifest.dependencies).toContain('onnxruntime');
  });

  it('FR-W6-07-05: GIVEN target "jetson-nano", WHEN createManifest called, THEN manifest has CUDA config + FP16', () => {
    const manifest = deployer.createManifest('jetson-nano', '/models/model_fp16.onnx');
    expect(manifest.deviceType).toBe('jetson-nano');
    expect(manifest.precision).toBe('fp16');
    expect(manifest.maxMemoryMB).toBeLessThanOrEqual(2048);
    expect(manifest.dependencies).toContain('onnxruntime-gpu');
  });

  // --- validateDeployment ---

  it('FR-W6-07-06: GIVEN valid ONNX model on device, WHEN validateDeployment called, THEN returns {valid:true, latencyMs<200}', async () => {
    const result = await deployer.validateDeployment('/models/model_int8.onnx', 'rpi4');
    expect(result.valid).toBe(true);
    expect(result.latencyMs).toBeLessThan(200);
  });

  it('FR-W6-07-07: GIVEN corrupt ONNX file (validateModel returns false), WHEN validateDeployment called, THEN throws EdgeDeploymentError', async () => {
    mockRuntime.validateModel.mockResolvedValueOnce(false);
    await expect(deployer.validateDeployment('/models/corrupt.onnx', 'rpi4')).rejects.toThrow(EdgeDeploymentError);
  });

  it('FR-W6-07-08: GIVEN inference latency >200ms on RPi4, WHEN validateDeployment called, THEN result.valid false with latency warning', async () => {
    mockRuntime.runInference.mockResolvedValueOnce({ latencyMs: 350, output: [0.1, 0.8, 0.1] });
    const result = await deployer.validateDeployment('/models/heavy_model.onnx', 'rpi4');
    expect(result.valid).toBe(false);
    expect(result.warnings).toContain('latency');
  });

  it('FR-W6-07-09: GIVEN EdgeDeploymentError thrown, WHEN caught, THEN has diagnostic field', async () => {
    mockRuntime.validateModel.mockResolvedValueOnce(false);
    try {
      await deployer.validateDeployment('/bad.onnx', 'rpi4');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(EdgeDeploymentError);
      expect((e as EdgeDeploymentError).diagnostic).toBeTruthy();
    }
  });

  it('FR-W6-07-10: GIVEN manifest created, WHEN modelPath checked, THEN matches provided path', () => {
    const manifest = deployer.createManifest('rpi4', '/opt/models/yamnnet_int8.onnx');
    expect(manifest.modelPath).toBe('/opt/models/yamnnet_int8.onnx');
  });
});
