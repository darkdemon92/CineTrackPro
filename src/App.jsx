import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Film, Tv, Clock, CheckCircle, Plus, Bell, RefreshCw, AlertCircle, Play, Eye, Cloud } from 'lucide-react';
import { useMovies } from './hooks/useMovies';
import { SearchBar } from './components/SearchBar';
import { MovieCard } from './components/MovieCard';
import { SeasonTracker } from './components/SeasonTracker';
import { useOMDB } from './hooks/useOMDB';
import './styles/cinematic.css';


// Componente principal que orquesta toda la aplicación
function App() {
  // Estado para controlar qué pestaña está activa
  const [activeTab, setActiveTab] = useState('series_watching');
  // Estado para controlar el modal de búsqueda
  const [showSearch, setShowSearch] = useState(false);
  // Estado para la película seleccionada (para ver detalles/episodios)
  const [selectedMovie, setSelectedMovie] = useState(null);
  // Estado para notificaciones
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // Hook de OMDB para buscar nuevos episodios
  const { getSeasonDetails } = useOMDB();

  // Cuando se selecciona una película, buscar la versión más reciente en las listas
  const handleSelectMovie = (movie) => {
    const allLists = [...watching, ...wantToWatch, ...completed];
    const freshMovie = allLists.find(m => m.id === movie.id);
    setSelectedMovie(freshMovie || movie);
  };


  // Usamos nuestro hook personalizado que conecta con IndexedDB
  const {
    watching,
    wantToWatch,
    completed,
    isSyncing,
    lastSync,
    addMovie,
    updateStatus,
    toggleEpisode,
    removeMovie,
    forceSync
  } = useMovies();

  // Filtrar listas por tipo
  const seriesWatching = watching.filter(m => m.type === 'series');
  const moviesWantToWatch = wantToWatch.filter(m => m.type === 'movie');
  const moviesCompleted = completed.filter(m => m.type === 'movie');
  const seriesCompleted = completed.filter(m => m.type === 'series');


  // Determina qué lista mostrar según la pestaña activa
  const getCurrentList = () => {
    switch (activeTab) {
      case 'series_watching': return seriesWatching;
      case 'movies_want_to_watch': return moviesWantToWatch;
      case 'movies_completed': return moviesCompleted;
      case 'series_completed': return seriesCompleted;
      default: return seriesWatching;
    }
  };

  // Función para obtener el nombre de la pestaña activa
  const getTabName = () => {
    switch (activeTab) {
      case 'series_watching': return 'Series Viendo';
      case 'movies_want_to_watch': return 'Películas Pendientes';
      case 'movies_completed': return 'Películas Completadas';
      case 'series_completed': return 'Series Completadas';
      default: return '';
    }
  };


  // Función para verificar nuevos episodios de las series
  const checkNewEpisodes = async () => {
    const allSeries = [...seriesWatching, ...seriesCompleted];
    const newNotifications = [];

    for (const series of allSeries) {
      try {
        // Obtener información de cada temporada
        for (let season = 1; season <= (series.totalSeasons || 0); season++) {
          const seasonData = await getSeasonDetails(series.imdbId, season);
          
          if (seasonData?.Episodes) {
            for (const ep of seasonData.Episodes) {
              // Verificar si el episodio ya fue visto
              const epKey = `S${String(season).padStart(2, '0')}E${String(ep.Episode).padStart(2, '0')}`;
              const isWatched = series.progress?.completedEpisodes?.includes(epKey);

              if (!isWatched && ep.Released) {
                const releaseDate = new Date(ep.Released);
                const now = new Date();
                const daysUntilRelease = Math.ceil((releaseDate - now) / (1000 * 60 * 60 * 24));

                // Si sale en los próximos 7 días o ya salió
                if (daysUntilRelease <= 7 && daysUntilRelease >= -1) {
                  newNotifications.push({
                    id: `${series.imdbId}-${epKey}`,
                    seriesId: series.id,
                    seriesTitle: series.title,
                    season,
                    episode: ep.Episode,
                    title: ep.Title,
                    released: ep.Released,
                    daysUntilRelease,
                    type: daysUntilRelease <= 0 ? 'new' : 'upcoming',
                    poster: series.poster
                  });
                }
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error checking episodes for ${series.title}:`, error);
      }
    }

    setNotifications(newNotifications);
    return newNotifications;
  };

  // Verificar nuevos episodios al iniciar y cada cierto tiempo
  useEffect(() => {
    if (seriesWatching.length > 0 || seriesCompleted.length > 0) {
      checkNewEpisodes();
      
      // Verificar cada 15 minutos
      const interval = setInterval(checkNewEpisodes, 15 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [seriesWatching.length, seriesCompleted.length]);

  // Solicitar permiso de notificaciones del navegador
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Notificaciones del navegador cuando hay nuevos episodios
  useEffect(() => {
    if (notifications.length > 0 && 'Notification' in window && Notification.permission === 'granted') {
      const newEps = notifications.filter(n => n.type === 'new');
      if (newEps.length > 0) {
        new Notification('CineTrack Pro', {
          body: `${newEps.length} nuevo(s) episodio(s) disponible(s)!`,
          icon: '/vite.svg'
        });
      }
    }
  }, [notifications]);


  // Maneja la adición de una nueva película desde el buscador
  const handleAddMovie = async (movieData) => {
    try {
      // Por defecto, las películas van a "Quiero ver", las series a "Viendo"
      const initialStatus = movieData.Type === 'series' ? 'watching' : 'want_to_watch';
      await addMovie(movieData, initialStatus);
      setShowSearch(false);
      
      // Solicitamos permiso para notificaciones si es una serie
      if (movieData.Type === 'series' && 'Notification' in window) {
        Notification.requestPermission();
      }
    } catch (error) {
      alert(error.message);
    }
  };


  // Función para manejar el toggle de episodio y actualizar la UI inmediatamente
  const handleToggleEpisode = async (movieId, season, episode) => {
    await toggleEpisode(movieId, season, episode);
    
    // Actualizar selectedMovie con los datos más recientes del estado
    const allLists = [...watching, ...wantToWatch, ...completed];
    const updatedMovie = allLists.find(m => m.id === movieId);
    if (updatedMovie) {
      setSelectedMovie({ ...updatedMovie });
    }
  };


  return (
    <div className="app-container">
      {/* Header con logo y botón de búsqueda */}
      <header className="app-header">
        <div className="logo">
          <Film size={32} color="#e50914" />
          CineTrack Pro
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {/* Indicador de sincronización */}
          <div 
            className="sync-indicator"
            onClick={forceSync}
            title={lastSync ? `Última sincronización: ${lastSync.toLocaleTimeString()}` : 'Sincronizando...'}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              borderRadius: '20px',
              background: isSyncing ? 'rgba(229, 9, 20, 0.2)' : 'rgba(255, 255, 255, 0.1)',
              cursor: 'pointer',
              transition: 'all 0.3s'
            }}
          >
            {isSyncing ? (
              <RefreshCw size={16} color="#e50914" style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <Cloud size={16} color="#46d369" />
            )}
            <span style={{ fontSize: '0.75rem', color: isSyncing ? '#e50914' : '#46d369' }}>
              {isSyncing ? 'Sincronizando...' : 'Sincronizado'}
            </span>
          </div>
          
          <button 
            className="add-button"
            onClick={() => setShowSearch(true)}
          >
            <Plus size={20} />
            Agregar
          </button>
          
          <button className="action-btn" style={{ position: 'relative' }} onClick={() => setShowNotifications(!showNotifications)}>
            <Bell size={20} />
            {/* Badge de notificaciones pendientes */}
            {notifications.length > 0 && (
              <span style={{
                position: 'absolute',
                top: -2,
                right: -2,
                width: 16,
                height: 16,
                background: '#e50914',
                borderRadius: '50%',
                fontSize: '0.6rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white'
              }}>
                {notifications.length}
              </span>
            )}
          </button>
        </div>
      </header>


      {/* Panel de notificaciones */}
      {showNotifications && (
        <div className="notifications-panel">
          <div className="notifications-header">
            <h3>Notificaciones</h3>
            <button onClick={() => setShowNotifications(false)}>✕</button>
          </div>
          <div className="notifications-list">
            {notifications.length === 0 ? (
              <p className="no-notifications">No hay notificaciones</p>
            ) : (
              notifications.map(notif => (
                <div key={notif.id} className={`notification-item ${notif.type}`}>
                  <div className="notification-poster">
                    {notif.poster ? <img src={notif.poster} alt={notif.seriesTitle} /> : <Tv size={20} />}
                  </div>
                  <div className="notification-info">
                    <h4>{notif.seriesTitle}</h4>
                    <p>Temporada {notif.season}, Episodio {notif.episode}</p>
                    <span className={`notification-badge ${notif.type}`}>
                      {notif.type === 'new' ? '¡NUEVO!' : notif.daysUntilRelease === 0 ? 'HOY' : `En ${notif.daysUntilRelease} días`}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}


      {/* Pestañas de navegación */}
      <div className="tabs-container">
        <button 
          className={`tab ${activeTab === 'series_watching' ? 'active' : ''}`}
          onClick={() => setActiveTab('series_watching')}
        >
          <Tv size={18} />
          Series Viendo ({seriesWatching.length})
        </button>
        <button 
          className={`tab ${activeTab === 'movies_want_to_watch' ? 'active' : ''}`}
          onClick={() => setActiveTab('movies_want_to_watch')}
        >
          <Clock size={18} />
          Películas Pendientes ({moviesWantToWatch.length})
        </button>
        <button 
          className={`tab ${activeTab === 'movies_completed' ? 'active' : ''}`}
          onClick={() => setActiveTab('movies_completed')}
        >
          <Film size={18} />
          Películas ({moviesCompleted.length})
        </button>
        <button 
          className={`tab ${activeTab === 'series_completed' ? 'active' : ''}`}
          onClick={() => setActiveTab('series_completed')}
        >
          <CheckCircle size={18} />
          Series ({seriesCompleted.length})
        </button>
      </div>


      {/* Grid de películas/series */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="movies-grid"
        >
          {getCurrentList().length === 0 ? (
            <div className="empty-state" style={{ gridColumn: '1 / -1' }}>
              <div className="empty-state-icon">🎬</div>
              <h3>No hay nada aquí aún</h3>
              <p>Agrega {activeTab.includes('series') ? 'series' : 'películas'} a tu lista</p>
            </div>
          ) : (
            getCurrentList().map(movie => (
              <MovieCard
                key={movie.id}
                movie={movie}
                onStatusChange={updateStatus}
                onDelete={removeMovie}
                onClick={handleSelectMovie}
              />
            ))
          )}
        </motion.div>
      </AnimatePresence>


      {/* Modal de búsqueda */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay"
            onClick={() => setShowSearch(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="modal-content"
              onClick={e => e.stopPropagation()}
            >
              <h2 className="modal-title">¿Qué quieres ver?</h2>
              <SearchBar 
                onSelect={handleAddMovie} 
                onClose={() => setShowSearch(false)}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Modal de detalles/episodios */}
      <AnimatePresence>
        {selectedMovie && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="details-modal"
            onClick={() => setSelectedMovie(null)}
          >
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className="details-content"
              onClick={e => e.stopPropagation()}
            >
              {/* Header del detalle */}
              <div className="details-header">
                <img 
                  src={selectedMovie.poster || '/placeholder.jpg'} 
                  alt={selectedMovie.title}
                  className="details-poster"
                />
                <div className="details-info">
                  <h1 className="details-title">
                    {selectedMovie.title}
                  </h1>
                  <p className="details-plot">
                    {selectedMovie.plot || 'Sin sinopsis disponible'}
                  </p>
                  
                  <div className="details-tags">
                    <span className="tag tag-type">
                      {selectedMovie.type === 'series' ? 'Serie' : 'Película'}
                    </span>
                    {selectedMovie.rating && selectedMovie.rating !== 'N/A' && (
                      <span className="tag tag-rating">
                        ⭐ {selectedMovie.rating}
                      </span>
                    )}
                  </div>
                </div>
              </div>


              {/* Si es serie, mostramos el tracker de temporadas */}
              {selectedMovie.type === 'series' && (
                <SeasonTracker 
                  movie={selectedMovie}
                  onToggleEpisode={handleToggleEpisode}
                />
              )}


              {/* Botón cerrar */}
              <button
                className="close-btn"
                onClick={() => setSelectedMovie(null)}
              >
                ×
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


export default App;
