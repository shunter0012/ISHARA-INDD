import React, { useState, useEffect } from 'react';
import { MusicTrack } from '../../types/index';
import { useAudioPlayer } from '../../context/AudioPlayerContext';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../lib/api';
import { UniversalMusicPicker } from './UniversalMusicPicker';
import { Play, Pause, Music, Plus, Sparkles, Disc3, Info } from 'lucide-react';

interface MusicViewProps {
  onSelectUser: (username: string) => void;
  onSelectReel?: (reelId: string) => void;
  onUseAudio?: (track: MusicTrack) => void;
}

export const MusicView: React.FC<MusicViewProps> = ({ 
  onSelectUser, 
  onSelectReel, 
  onUseAudio 
}) => {
  const { user } = useAuth();
  const { currentTrack, isPlaying, playTrack, setDetailTrack, detailTrack } = useAudioPlayer();

  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [selectedGenre, setSelectedGenre] = useState<string>('All');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchTracks = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<{ tracks: MusicTrack[] }>('/tracks');
      setTracks(res.tracks || []);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTracks();
  }, []);

  const genres = ['All', 'Trending', 'Lo-Fi', 'Pop', 'Synthwave', 'Acoustic', 'Original', 'Electronic'];

  const filteredTracks = selectedGenre === 'All'
    ? tracks
    : selectedGenre === 'Trending'
    ? [...tracks].sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
    : tracks.filter(t => t.genre?.toLowerCase() === selectedGenre.toLowerCase());

  return (
    <div className="w-full max-w-2xl mx-auto pb-24 space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-zinc-900 to-black text-white p-6 rounded-3xl shadow-lg flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2 text-pink-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Sparkles className="w-4 h-4" />
            <span>Audio & Music Library</span>
          </div>
          <h2 className="text-xl font-extrabold font-['Outfit']">Soundtrack Your Content</h2>
          <p className="text-xs text-zinc-400 mt-1 max-w-md">
            Discover community tracks, preview songs, trim snippets, and attach audio to your Reels and Posts.
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2.5 bg-white hover:bg-zinc-100 text-black text-xs font-bold rounded-2xl flex items-center space-x-1.5 shadow-md active:scale-95 transition-transform shrink-0 ml-4 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Upload Audio</span>
        </button>
      </div>

      {/* Genre Filter Pills */}
      <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-1">
        {genres.map(g => (
          <button
            key={g}
            onClick={() => setSelectedGenre(g)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              selectedGenre === g
                ? 'bg-zinc-900 text-white shadow-xs'
                : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50'
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Tracks Grid */}
      <div className="space-y-3">
        {loading ? (
          <div className="py-12 text-center text-xs text-zinc-400">Loading audio library...</div>
        ) : filteredTracks.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-400 bg-white rounded-2xl border border-zinc-200">
            No audio tracks found in this category.
          </div>
        ) : (
          filteredTracks.map(track => {
            const isCurrent = currentTrack?.id === track.id && isPlaying;
            return (
              <div
                key={track.id}
                className="bg-white border border-zinc-200/80 p-3.5 rounded-2xl flex items-center justify-between hover:border-zinc-300 transition-colors shadow-xs group"
              >
                <div 
                  onClick={() => playTrack(track)}
                  className="flex items-center space-x-3.5 min-w-0 cursor-pointer flex-1 mr-3"
                >
                  <div className="relative shrink-0 w-12 h-12 rounded-xl overflow-hidden bg-zinc-900 shadow-xs border border-zinc-200">
                    <img
                      src={track.coverUrl}
                      alt={track.title}
                      className="w-full h-full object-cover"
                    />
                    <div className={`absolute inset-0 bg-black/40 flex items-center justify-center text-white ${
                      isCurrent ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    } transition-opacity`}>
                      {isCurrent ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center space-x-1.5">
                      <h4 className="text-xs font-bold text-zinc-900 truncate group-hover:underline">
                        {track.title}
                      </h4>
                      {track.featured && (
                        <span className="text-[9px] px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded-full font-bold shrink-0">
                          Popular
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-500 truncate">{track.artist}</p>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-[10px] text-zinc-400">
                        {track.usageCount || 1} uses
                      </span>
                      {track.genre && (
                        <span className="text-[10px] px-1.5 py-0.2 bg-zinc-100 text-zinc-600 rounded-md font-medium">
                          {track.genre}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  <button
                    onClick={() => setDetailTrack(track)}
                    className="p-2 text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
                    title="Audio Page & Media"
                  >
                    <Info className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      if (onUseAudio) {
                        onUseAudio(track);
                      } else {
                        playTrack(track);
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all bg-zinc-900 text-white hover:bg-black cursor-pointer"
                  >
                    Use Sound
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Universal Music Picker */}
      <UniversalMusicPicker
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSelectTrack={(track) => {
          setTracks(prev => [track, ...prev.filter(t => t.id !== track.id)]);
          if (onUseAudio) {
            onUseAudio(track);
          } else {
            playTrack(track);
          }
          setIsAddModalOpen(false);
        }}
        onTrackCreated={(track) => {
          setTracks(prev => [track, ...prev.filter(t => t.id !== track.id)]);
          if (onUseAudio) {
            onUseAudio(track);
          } else {
            playTrack(track);
          }
          setIsAddModalOpen(false);
        }}
      />
    </div>
  );
};
