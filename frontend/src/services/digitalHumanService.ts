/**
 * 数字人交互核心服务 v4 — 类似豆包打电话体验
 *
 * 流程：
 *   按住麦克风 → 实时音量波动反馈 → 松开
 *   → PCM 音频 → /api/voice/transcribe (讯飞 IAT) → 转写文字显示
 *   → /api/chat/stream (Spark LLM) → 回复显示 + 朗读
 */

export type DHState = 'idle' | 'listening' | 'thinking' | 'speaking';

export type DHEvent =
  | { type: 'state_change'; state: DHState }
  | { type: 'user_text'; text: string; isFinal: boolean }
  | { type: 'ai_text'; text: string; isFinal: boolean }
  | { type: 'audio_level'; level: number }
  | { type: 'error'; message: string };

export type DHListener = (event: DHEvent) => void;

class DigitalHumanService {
  private listeners: Set<DHListener> = new Set();
  private _state: DHState = 'idle';

  // 音频相关
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: BlobPart[] = [];
  private analyserNode: AnalyserNode | null = null;
  private volumeMonitor: ReturnType<typeof setInterval> | null = null;

  // 合成
  private synthesis: SpeechSynthesis | null = null;
  private utterance: SpeechSynthesisUtterance | null = null;
  private lipSyncTimer: ReturnType<typeof setInterval> | null = null;

  // SSE
  private abortController: AbortController | null = null;
  private conversationId: number | null = null;

  get state(): DHState { return this._state; }

  addListener(l: DHListener) { this.listeners.add(l); return () => this.listeners.delete(l); }
  private emit(e: DHEvent) { this.listeners.forEach(l => { try { l(e); } catch {} }); }
  private setState(s: DHState) {
    if (this._state !== s) { this._state = s; this.emit({ type: 'state_change', state: s }); }
  }

  // ── 按着说话 ──

  async startListening(cid: number | null) {
    if (this._state === 'listening') return;

    this.conversationId = cid;
    this.audioChunks = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaStream = stream;

      // 音量分析
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      source.connect(this.analyserNode);
      this.startVolumeMonitor();

      // 录制
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm';
      this.mediaRecorder = new MediaRecorder(stream, { mimeType });
      this.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.audioChunks.push(e.data); };
      this.mediaRecorder.start();

      this.setState('listening');

    } catch (e: unknown) {
      const msg = e instanceof DOMException && e.name === 'NotAllowedError'
        ? '请允许麦克风权限' : `麦克风启动失败`;
      this.emit({ type: 'error', message });
    }
  }

  // ── 松开 → 识别 → 对话 ──

  async stopAndTranscribe() {
    if (this._state !== 'listening') return;
    this.stopVolumeMonitor();
    this.setState('thinking');

    // 停止录音
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    // 等待录音结束拿到数据
    await new Promise<void>((resolve) => {
      if (!this.mediaRecorder) { resolve(); return; }
      const origOnStop = this.mediaRecorder.onstop;
      this.mediaRecorder.onstop = () => {
        if (origOnStop) origOnStop.call(this.mediaRecorder, new Event('stop'));
        resolve();
      };
      // 如果已经 inactive，直接 resolve
      if (this.mediaRecorder.state === 'inactive') resolve();
    });

    // 清理音频资源
    if (this.mediaStream) { this.mediaStream.getTracks().forEach(t => t.stop()); this.mediaStream = null; }
    if (this.audioContext) { this.audioContext.close().catch(() => {}); this.audioContext = null; }
    this.analyserNode = null;

    if (this.audioChunks.length === 0) { this.setState('idle'); return; }

    // 显示"语音识别中..."
    this.emit({ type: 'user_text', text: '⋯', isFinal: false });

    try {
      const blob = new Blob(this.audioChunks);
      const formData = new FormData();
      formData.append('file', blob, 'audio.webm');

      const token = localStorage.getItem('auth_token');
      const resp = await fetch('/api/voice/transcribe', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!resp.ok) { this.emit({ type: 'error', message: `转写失败 (HTTP ${resp.status})` }); this.setState('idle'); return; }

      const data = await resp.json();
      const text = (data.text || '').trim();

      if (!text) {
        this.emit({ type: 'error', message: '请说话，没能识别到语音' });
        this.setState('idle');
        return;
      }

      // 显示识别结果
      this.emit({ type: 'user_text', text, isFinal: true });
      await this.sendToLLM(text);

    } catch (e: unknown) {
      this.emit({ type: 'error', message: `转写出错: ${e instanceof Error ? e.message : String(e)}` });
      this.setState('idle');
    }
  }

  private startVolumeMonitor() {
    if (!this.analyserNode) return;
    const data = new Uint8Array(this.analyserNode.frequencyBinCount);
    this.volumeMonitor = setInterval(() => {
      this.analyserNode!.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const level = sum / data.length / 255;
      this.emit({ type: 'audio_level', level: Math.min(1, level * 3) });
    }, 60);
  }

  private stopVolumeMonitor() {
    if (this.volumeMonitor) { clearInterval(this.volumeMonitor); this.volumeMonitor = null; }
    this.emit({ type: 'audio_level', level: 0 });
  }

  // ── LLM ──

  private async sendToLLM(text: string) {
    this.abortController = new AbortController();

    try {
      const body: Record<string, unknown> = { message: text };
      if (this.conversationId != null) body.conversation_id = this.conversationId;

      const token = localStorage.getItem('auth_token');
      const resp = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
        signal: this.abortController.signal,
      });

      if (!resp.ok) { this.emit({ type: 'error', message: `LLM ${resp.status}` }); this.setState('idle'); return; }

      const reader = resp.body?.getReader();
      if (!reader) { this.setState('idle'); return; }

      const decoder = new TextDecoder();
      let buf = '', content = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.type === 'text') {
              content += d.content;
              this.emit({ type: 'ai_text', text: content, isFinal: false });
            } else if (d.type === 'done') {
              this.conversationId = d.conversation_id || this.conversationId;
              this.emit({ type: 'ai_text', text: content, isFinal: true });
              this.speakText(content);
            } else if (d.type === 'error') {
              this.emit({ type: 'error', message: d.content }); this.setState('idle');
            }
          } catch {}
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== 'AbortError') {
        this.emit({ type: 'error', message: `网络错误` });
        this.setState('idle');
      }
    }
  }

  // ── 语音合成 ──

  private speakText(text: string) {
    const clean = text.replace(/#{1,6}\s+/g, '').replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`{1,3}[^`]*`{1,3}/g, '').replace(/>\s+/g, '').replace(/\n{2,}/g, '。')
      .replace(/\|/g, '').trim();
    if (!clean) { this.setState('idle'); return; }

    const short = clean.length > 600 ? clean.slice(0, 600) + '。' : clean;

    this.synthesis = window.speechSynthesis;
    this.utterance = new SpeechSynthesisUtterance(short);
    this.utterance.lang = 'zh-CN';
    this.utterance.rate = 1.0;
    const voices = this.synthesis.getVoices();
    const zh = voices.find(v => v.lang.startsWith('zh'));
    if (zh) this.utterance.voice = zh;

    this.utterance.onstart = () => { this.setState('speaking'); this.startLipSync(); };
    this.utterance.onend = () => { this.stopLipSync(); this.setState('idle'); };
    this.utterance.onerror = () => { this.stopLipSync(); this.setState('idle'); };
    this.synthesis.speak(this.utterance);
  }

  private startLipSync() {
    let p = 0;
    this.lipSyncTimer = setInterval(() => {
      p += 0.3;
      this.emit({ type: 'audio_level', level: 0.3 + 0.5 * (Math.sin(p) * 0.5 + 0.5) });
    }, 100);
  }

  private stopLipSync() {
    if (this.lipSyncTimer) { clearInterval(this.lipSyncTimer); this.lipSyncTimer = null; }
    this.emit({ type: 'audio_level', level: 0 });
  }

  // ── 停止 ──

  stopAll() {
    this.stopVolumeMonitor();
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try { this.mediaRecorder.stop(); } catch {}
    }
    if (this.mediaStream) { this.mediaStream.getTracks().forEach(t => t.stop()); this.mediaStream = null; }
    if (this.audioContext) { this.audioContext.close().catch(() => {}); this.audioContext = null; }
    if (this.synthesis) { this.synthesis.cancel(); }
    if (this.abortController) { this.abortController.abort(); this.abortController = null; }
    this.stopLipSync();
    this.audioChunks = [];
    this.analyserNode = null;
    this.setState('idle');
  }
}

export const digitalHumanService = new DigitalHumanService();
