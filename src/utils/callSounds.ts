/**
 * Web Audio API synthesizer for phone calling sounds.
 * Generates telephone tones directly in browser memory without external audio file dependencies.
 */

class CallSoundsManager {
  private ctx: AudioContext | null = null;
  private ringtoneInterval: any = null;
  private currentNodes: { osc1?: OscillatorNode; osc2?: OscillatorNode; gain?: GainNode } = {};

  private getContext(): AudioContext | null {
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  /**
   * Play standard dual-tone multi-frequency ringback for outgoing calls
   * 440 Hz + 480 Hz (US standard telephone ringback tone: 2s tone, 3s silence)
   */
  public startOutgoingRingtone(): void {
    this.stopAll();
    const ctx = this.getContext();
    if (!ctx) return;

    const playBurst = () => {
      try {
        if (!this.ctx || this.ctx.state === 'closed') return;
        const now = this.ctx.currentTime;

        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(440, now);
        osc2.frequency.setValueAtTime(480, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.05);
        gain.gain.setValueAtTime(0.12, now + 1.8);
        gain.gain.linearRampToValueAtTime(0, now + 2.0);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 2.0);
        osc2.stop(now + 2.0);
      } catch {
        // Ignore audio playback errors if policy blocks autoplay
      }
    };

    playBurst();
    this.ringtoneInterval = setInterval(playBurst, 4000);
  }

  /**
   * Play melodic pulsing tone for incoming calls
   */
  public startIncomingRingtone(): void {
    this.stopAll();
    const ctx = this.getContext();
    if (!ctx) return;

    const playMelody = () => {
      try {
        if (!this.ctx || this.ctx.state === 'closed') return;
        const now = this.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 arpeggio

        notes.forEach((freq, idx) => {
          if (!this.ctx) return;
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.15);

          const startTime = now + idx * 0.15;
          const duration = 0.25;

          gain.gain.setValueAtTime(0, startTime);
          gain.gain.linearRampToValueAtTime(0.15, startTime + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

          osc.connect(gain);
          gain.connect(this.ctx.destination);

          osc.start(startTime);
          osc.stop(startTime + duration);
        });
      } catch {
        // Ignore
      }
    };

    playMelody();
    this.ringtoneInterval = setInterval(playMelody, 2500);
  }

  /**
   * Play call connected confirmation chime
   */
  public playConnectedChime(): void {
    this.stopAll();
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.18); // A5

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch {
      // Ignore
    }
  }

  /**
   * Play call ended tone (short descending beep)
   */
  public playEndTone(): void {
    this.stopAll();
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.linearRampToValueAtTime(220, now + 0.25);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.3);
    } catch {
      // Ignore
    }
  }

  /**
   * Play busy tone (fast pulsed 480 Hz tone)
   */
  public playBusyTone(): void {
    this.stopAll();
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        const t = now + i * 0.4;
        osc.frequency.setValueAtTime(480, t);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.setValueAtTime(0, t + 0.2);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(t);
        osc.stop(t + 0.2);
      }
    } catch {
      // Ignore
    }
  }

  /**
   * Stop all playing ringtones and tones
   */
  public stopAll(): void {
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
    if (this.currentNodes.osc1) {
      try { this.currentNodes.osc1.stop(); } catch {}
    }
    if (this.currentNodes.osc2) {
      try { this.currentNodes.osc2.stop(); } catch {}
    }
    this.currentNodes = {};
  }
}

export const callSounds = new CallSoundsManager();
