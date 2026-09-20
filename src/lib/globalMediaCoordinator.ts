export type MediaSource = 
  | 'audio-player'
  | 'post-video'
  | 'reel-video'
  | 'story'
  | 'preview'
  | 'voice-note';

export interface ActiveMediaInfo {
  source: MediaSource;
  id?: string;
  timestamp: number;
}

type MediaListener = (event: { activeSource: MediaSource; activeId?: string }) => void;

class GlobalMediaCoordinator {
  private activeMedia: ActiveMediaInfo | null = null;
  private listeners: Set<MediaListener> = new Set();

  /**
   * Broadcast that a media source has started playing.
   * All other media sources MUST pause their playback immediately.
   */
  public play(source: MediaSource, id?: string) {
    this.activeMedia = { source, id, timestamp: Date.now() };
    this.notify(source, id);
  }

  /**
   * Inform the coordinator that a media source was paused.
   */
  public pause(source: MediaSource, id?: string) {
    if (this.activeMedia?.source === source && (!id || this.activeMedia.id === id)) {
      this.activeMedia = null;
    }
  }

  /**
   * Stop any active media across the app.
   */
  public stopAll() {
    this.activeMedia = null;
    this.notify('preview', '__stop_all__');
  }

  public getActive(): ActiveMediaInfo | null {
    return this.activeMedia;
  }

  public isPlaying(source: MediaSource, id?: string): boolean {
    if (!this.activeMedia) return false;
    if (this.activeMedia.source !== source) return false;
    if (id && this.activeMedia.id !== id) return false;
    return true;
  }

  public subscribe(listener: MediaListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(activeSource: MediaSource, activeId?: string) {
    this.listeners.forEach((listener) => {
      try {
        listener({ activeSource, activeId });
      } catch (err) {
        console.warn('[GlobalMediaCoordinator] Listener error:', err);
      }
    });
  }
}

export const globalMediaCoordinator = new GlobalMediaCoordinator();
