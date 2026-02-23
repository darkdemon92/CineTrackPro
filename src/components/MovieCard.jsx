import React from 'react';
import { motion } from 'framer-motion';
import { Play, Check, Clock, Trash2, Star, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';


// Componente que muestra cada película/serie en tu biblioteca
// Diseño tipo "tarjeta de cine" con glassmorphism
export const MovieCard = ({ movie, onStatusChange, onDelete, onClick }) => {
  
  // Determina el color del estado actual
  const getStatusColor = (status) => {
    switch (status) {
      case 'watching': return '#e50914'; // Rojo Netflix (viendo)
      case 'completed': return '#46d369'; // Verde (completado)
      case 'want_to_watch': return '#ffd700'; // Amarillo (pendiente)
      default: return '#808080';
    }
  };


  // Calcula progreso visual para series
  const progressPercent = movie.type === 'series' && movie.totalSeasons
    ? Math.round((movie.progress.completedEpisodes.length / (movie.totalSeasons * 10)) * 100)
    : movie.status === 'completed' ? 100 : 0;


  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ scale: 1.02, y: -5 }}
      className="movie-card"
      onClick={() => onClick?.(movie)}
    >
      {/* Imagen de fondo con overlay gradiente */}
      <div className="movie-card-image">
        {movie.poster ? (
          <img src={movie.poster} alt={movie.title} loading="lazy" />
        ) : (
          <div className="no-poster">
            <span>🎬</span>
          </div>
        )}
        <div className="movie-card-overlay" />
        
        {/* Badge de estado */}
        <div 
          className="status-badge"
          style={{ backgroundColor: getStatusColor(movie.status) }}
        >
          {movie.status === 'watching' && <Play size={12} fill="currentColor" />}
          {movie.status === 'completed' && <Check size={12} />}
          {movie.status === 'want_to_watch' && <Clock size={12} />}
        </div>
      </div>


      {/* Contenido de la tarjeta */}
      <div className="movie-card-content">
        <h3 className="movie-title">{movie.title}</h3>
        
        <div className="movie-meta">
          <span className="movie-year">{movie.year}</span>
          {movie.rating && movie.rating !== 'N/A' && (
            <span className="movie-rating">
              <Star size={12} fill="#ffd700" color="#ffd700" />
              {movie.rating}
            </span>
          )}
        </div>


        {/* Barra de progreso para series */}
        {movie.type === 'series' && (
          <div className="progress-section">
            <div className="progress-bar-bg">
              <motion.div 
                className="progress-bar-fill"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            </div>
            <span className="progress-text">
              {movie.progress.completedEpisodes.length} eps vistos
            </span>
          </div>
        )}


        {/* Fecha de última actualización */}
        <div className="movie-footer">
          <span className="last-updated">
            <Calendar size={12} />
            {format(new Date(movie.lastUpdated), 'dd MMM', { locale: es })}
          </span>
          
          {/* Acciones rápidas */}
          <div className="card-actions">
            {movie.status !== 'completed' && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onStatusChange(movie.id, 'completed');
                }}
                className="action-btn complete-btn"
                title="Marcar como completada"
              >
                <Check size={16} />
              </button>
            )}
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onDelete(movie.id);
              }}
              className="action-btn delete-btn"
              title="Eliminar"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
