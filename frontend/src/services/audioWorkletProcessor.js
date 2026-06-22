/**
 * AudioWorklet PCM 采集处理器
 * 从麦克风接收 Float32 音频样本，发送到主线程进行降采样和编码
 */
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    // 复制缓冲区（AudioWorklet 的 buffer 在下一次 process 调用后会被回收）
    const samples = new Float32Array(input[0].length);
    samples.set(input[0]);

    this.port.postMessage({
      type: 'audio',
      samples,
    });
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
