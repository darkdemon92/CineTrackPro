import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, Play } from 'lucide-react';
import { useOMDB } from '../hooks/useOMDB';


// Componente para gestionar temporadas y episodios de series
// Muestra checkboxes para marcar qué episodios has visto
export const SeasonTracker = ({ movie, onToggleEpisode }) => {
  const [seasons, setSeasons] = useState([]);
  const [activeSeason, setActiveSeason] = useState(1);
  const [episodes, setEpisodes] = useState([]);
  const [completedEpisodes, setCompletedEpisodes] = useState(movie.progress?.completedEpisodes || []);
  const { getSeasonDetails, loading } = useOMDB();

  // Sincronizar con la prop movie cuando cambie
  useEffect(() => {
    setCompletedEpisodes(movie.progress?.completedEpisodes || []);
  }, [movie.id, movie.progress?.completedEpisodes]);


  // Carga las temporadas disponibles cuando se abre el componente
  useEffect(() => {
    if (movie.totalSeasons) {
      const seasonNumbers = Array.from(
        { length: parseInt(movie.totalSeasons) }, 
        (_, i) => i + 1
      );
      setSeasons(seasonNumbers);
      loadSeason(1);
    }
  }, [movie.totalSeasons, movie.imdbId]);


  // Carga los episodios de una temporada específica desde OMDB
  const loadSeason = async (seasonNum) => {
    setActiveSeason(seasonNum);
    const data = await getSeasonDetails(movie.imdbId, seasonNum);
    if (data && data.Episodes) {
      setEpisodes(data.Episodes);
    }
  };


  // Verifica si un episodio específico está marcado como visto
  const isEpisodeWatched = useCallback((episode) => {
    const key = `S${String(activeSeason).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
    return completedEpisodes.includes(key);
  }, [activeSeason, completedEpisodes]);


  // Manejar click en episodio
  const handleEpisodeClick = async (episode) => {
    const key = `S${String(activeSeason).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
    const isCurrentlyWatched = completedEpisodes.includes(key);
    
    // Actualizar estado local INMEDIATAMENTE (sin esperar BD)
    if (isCurrentlyWatched) {
      setCompletedEpisodes(prev => prev.filter(k => k !== key));
    } else {
      setCompletedEpisodes(prev => [...prev, key]);
    }
    
    // También llamar al handler original para guardar en BD
    await onToggleEpisode(movie.id, activeSeason, episode);
  };


  return (
    <div className="season-tracker">
      {/* Selector de temporadas */}
      <div className="season-tabs">
        {seasons.map(season => (
          <button
            key={season}
            className={`season-tab ${activeSeason === season ? 'active' : ''}`}
            onClick={() => loadSeason(season)}
          >
            Temp {season}
          </button>
        ))}
      </div>


      {/* Lista de episodios */}
      <div className="episodes-list">
        {loading ? (
          <div className="loading-episodes">Cargando episodios...</div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSeason}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="episodes-container"
            >
              {episodes.map((ep, index) => {
                const watched = isEpisodeWatched(ep.Episode);
                
                return (
                  <motion.div
                    key={ep.imdbID}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`episode-row ${watched ? 'watched' : ''}`}
                    onClick={() => handleEpisodeClick(ep.Episode)}
                  >
                    <div className="episode-checkbox">
                      {watched ? (
                        <Check size={16} className="check-icon" />
                      ) : (
                        <div className="empty-checkbox" />
                      )}
                    </div>
                    
                    <div className="episode-info">
                      <span className="episode-number">E{ep.Episode}</span>
                      <span className="episode-title">{ep.Title}</span>
                      {ep.Released && ep.Released !== 'N/A' && (
                        <span className="episode-date">{ep.Released}</span>
                      )}
                    </div>


                    {!watched && (
                      <Play size={14} className="play-icon" />
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        )}
      </div>


      {/* Resumen de progreso */}
      <div className="progress-summary">
        <div className="progress-stats">
          <span>
            {completedEpisodes.length} episodios vistos
          </span>
          <span className="progress-percentage">
            {Math.round((completedEpisodes.length / (seasons.length * 10)) * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
};
