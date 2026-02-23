import { useLiveQuery } from 'dexie-react-hooks';
import { localDB, initializeTurso, startAutoSync, smartSync } from '../db/database';
import { useCallback, useEffect, useState } from 'react';


// Hook con sincronización inteligente basada en timestamps
export const useMovies = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [syncResult, setSyncResult] = useState(null);

  // Inicializar base de datos y auto-sincronización
  useEffect(() => {
    const init = async () => {
      try {
        await initializeTurso();
        startAutoSync(1800000); // Verificar cada 30 minutos
      } catch (err) {
        console.error('Error inicializando:', err);
      }
    };
    init();
  }, []);

  // Obtiene todas las películas/series guardadas localmente
  const movies = useLiveQuery(
    () => localDB.movies.orderBy('addedAt').reverse().toArray(),
    []
  );

  // Filtra las que estás viendo actualmente
  const watching = useLiveQuery(
    () => localDB.movies.where('status').equals('watching').toArray(),
    []
  );

  // Filtra las que quieres ver
  const wantToWatch = useLiveQuery(
    () => localDB.movies.where('status').equals('want_to_watch').toArray(),
    []
  );

  // Filtra las completadas
  const completed = useLiveQuery(
    () => localDB.movies.where('status').equals('completed').toArray(),
    []
  );

  // Agrega una nueva película/serie
  const addMovie = useCallback(async (omdbData, initialStatus = 'want_to_watch') => {
    const existing = await localDB.movies.where('imdbId').equals(omdbData.imdbID).first();
    if (existing) {
      throw new Error('Esta película/serie ya está en tu lista');
    }

    const movieData = {
      imdbId: omdbData.imdbID,
      title: omdbData.Title,
      year: omdbData.Year,
      type: omdbData.Type,
      poster: omdbData.Poster !== 'N/A' ? omdbData.Poster : null,
      plot: omdbData.Plot,
      genre: omdbData.Genre,
      rating: omdbData.imdbRating,
      totalSeasons: omdbData.totalSeasons ? parseInt(omdbData.totalSeasons) : null,
      status: initialStatus,
      addedAt: new Date(),
      lastUpdated: new Date(),
      progress: {
        currentSeason: 1,
        currentEpisode: 0,
        completedEpisodes: []
      }
    };

    await localDB.movies.add(movieData);
    
    // Sincronizar en background (sin esperar)
    smartSync();
    
    return movieData;
  }, []);

  // Actualiza el estado
  const updateStatus = useCallback(async (id, newStatus) => {
    await localDB.movies.update(id, {
      status: newStatus,
      lastUpdated: new Date()
    });
    
    // Sincronizar en background
    smartSync();
  }, []);

  // Marca un episodio como visto/no visto
  const toggleEpisode = useCallback(async (movieId, season, episode) => {
    const episodeKey = `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
    
    const existing = await localDB.episodes
      .where('[movieId+season+episode]')
      .equals([movieId, season, episode])
      .first();

    const movie = await localDB.movies.get(movieId);
    
    if (existing) {
      await localDB.episodes.delete(existing.id);
      const newCompleted = (movie.progress?.completedEpisodes || []).filter(ep => ep !== episodeKey);
      await localDB.movies.update(movieId, {
        'progress.completedEpisodes': newCompleted,
        lastUpdated: new Date()
      });
    } else {
      await localDB.episodes.add({
        movieId,
        season,
        episode,
        episodeKey,
        watchedAt: new Date()
      });
      const newCompleted = [...(movie.progress?.completedEpisodes || []), episodeKey];
      await localDB.movies.update(movieId, {
        'progress.completedEpisodes': newCompleted,
        'progress.currentSeason': season,
        'progress.currentEpisode': episode,
        lastUpdated: new Date()
      });
    }
    
    // NO esperamos la sincronización - se hace en background
    // La sincronización periódica se encargará de subir los cambios
    smartSync(); // Fire and forget - no await
  }, []);

  // Calcula el porcentaje de progreso
  const getProgressPercentage = useCallback(async (movieId) => {
    const movie = await localDB.movies.get(movieId);
    if (!movie || movie.type !== 'series' || !movie.totalSeasons) return 0;

    const watchedCount = await localDB.episodes
      .where('movieId')
      .equals(movieId)
      .count();

    return Math.round((watchedCount / (movie.totalSeasons * 10)) * 100);
  }, []);

  // Elimina una película/serie
  const removeMovie = useCallback(async (id) => {
    await localDB.episodes.where('movieId').equals(id).delete();
    await localDB.movies.delete(id);
    
    // Sincronizar en background
    smartSync();
  }, []);

  // Forzar sincronización manual
  const forceSync = useCallback(async () => {
    setIsSyncing(true);
    const result = await smartSync();
    setSyncResult(result);
    setIsSyncing(false);
    setLastSync(new Date());
    return result;
  }, []);

  return {
    movies: movies || [],
    watching: watching || [],
    wantToWatch: wantToWatch || [],
    completed: completed || [],
    isSyncing,
    lastSync,
    syncResult,
    addMovie,
    updateStatus,
    toggleEpisode,
    getProgressPercentage,
    removeMovie,
    forceSync
  };
};
