// ============================================
// ARQUITECTURA HÍBRIDA: Dexie (local) + Turso (nube)
// Con sincronización inteligente basada en timestamps
// ============================================

import Dexie from 'dexie';
import { createClient } from '@libsql/client';

// ============================================
// PARTE 1: DEXIE (IndexedDB - Almacenamiento Local)
// ============================================

class CineDatabase extends Dexie {
  constructor() {
    super('CineTrackDB');
    
    this.version(1).stores({
      movies: '++id, imdbId, title, type, status, addedAt, lastUpdated',
      episodes: '++id, [movieId+season+episode], movieId, season, episode, watchedAt',
      notifications: '++id, movieId, type, createdAt, read',
      // Tabla para tracking de sincronización
      syncMeta: 'key, lastSyncedAt, localVersion, cloudVersion'
    });
  }
}

export const localDB = new CineDatabase();

// ============================================
// PARTE 2: TURSO (Base de datos en la nube)
// ============================================

const TURSO_AUTH_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJnaWQiOiJjZWJjMTY3Yy01YzUwLTRlMmMtYWEzYy1hOGNlM2JkZTA5NTIiLCJpYXQiOjE3NzE4NTcyMDcsInJpZCI6IjY0OTZlODVkLTQ2NGMtNDczYS1hMDk1LTJmZTUwN2JlOTEwMyJ9.VqDgTFg243W9ugUR92noeXkZ-MjK6kAcl6OjoXnj7Xx_6LedCOdbahWO_RLsvKRc3yiQTW0-a0ViAUd9EDfwCg';
const TURSO_URL = 'libsql://test-darkdemon92.aws-us-east-1.turso.io';

export const tursoClient = createClient({
  url: TURSO_URL,
  authToken: TURSO_AUTH_TOKEN
});

// ============================================
// PARTE 3: INICIALIZACIÓN DE TABLAS EN TURSO
// ============================================

export const initializeTurso = async () => {
  try {
    // Crear tabla movies si no existe
    await tursoClient.execute(`
      CREATE TABLE IF NOT EXISTS movies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        imdb_id TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        year TEXT,
        type TEXT NOT NULL,
        poster TEXT,
        plot TEXT,
        genre TEXT,
        rating TEXT,
        total_seasons INTEGER,
        status TEXT DEFAULT 'want_to_watch',
        added_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_updated TEXT NOT NULL,
        progress_current_season INTEGER DEFAULT 1,
        progress_current_episode INTEGER DEFAULT 0,
        progress_completed_episodes TEXT DEFAULT '[]',
        local_id INTEGER,
        synced_at TEXT
      )
    `);

    // Crear tabla episodes si no existe
    await tursoClient.execute(`
      CREATE TABLE IF NOT EXISTS episodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        imdb_id TEXT NOT NULL,
        movie_imdb_id TEXT NOT NULL,
        season INTEGER NOT NULL,
        episode INTEGER NOT NULL,
        episode_key TEXT NOT NULL,
        watched_at TEXT NOT NULL,
        local_id INTEGER,
        synced_at TEXT,
        UNIQUE(imdb_id, season, episode)
      )
    `);

    // Agregar columnas que faltan si la tabla ya existe (migración)
    try {
      await tursoClient.execute(`ALTER TABLE movies ADD COLUMN local_id INTEGER`);
    } catch (e) {
      // Columna ya existe, ignorar
    }
    try {
      await tursoClient.execute(`ALTER TABLE movies ADD COLUMN synced_at TEXT`);
    } catch (e) {
      // Columna ya existe, ignorar
    }
    try {
      await tursoClient.execute(`ALTER TABLE episodes ADD COLUMN local_id INTEGER`);
    } catch (e) {
      // Columna ya existe, ignorar
    }
    try {
      await tursoClient.execute(`ALTER TABLE episodes ADD COLUMN synced_at TEXT`);
    } catch (e) {
      // Columna ya existe, ignorar
    }
    try {
      await tursoClient.execute(`ALTER TABLE episodes ADD COLUMN imdb_id TEXT`);
    } catch (e) {
      // Columna ya existe, ignorar
    }
    try {
      await tursoClient.execute(`ALTER TABLE episodes ADD COLUMN movie_imdb_id TEXT`);
    } catch (e) {
      // Columna ya existe, ignorar
    }
    try {
      await tursoClient.execute(`ALTER TABLE episodes ADD COLUMN movie_id INTEGER`);
    } catch (e) {
      // Columna ya existe, ignorar
    }

    console.log('✅ Tablas Turso inicializadas');
  } catch (error) {
    console.error('❌ Error inicializando Turso:', error);
  }
};

// ============================================
// PARTE 4: FUNCIONES DE COMPARACIÓN Y RESOLUCIÓN
// ============================================

// Obtener fecha más reciente entre dos strings ISO
const getMostRecent = (date1, date2) => {
  const d1 = new Date(date1 || 0);
  const d2 = new Date(date2 || 0);
  return d1 >= d2 ? date1 : date2;
};

// Convertir registro de Turso al formato local
const tursoMovieToLocal = (row) => ({
  imdbId: row.imdb_id,
  title: row.title,
  year: row.year,
  type: row.type,
  poster: row.poster,
  plot: row.plot,
  genre: row.genre,
  rating: row.rating,
  totalSeasons: row.total_seasons,
  status: row.status,
  addedAt: row.added_at,
  lastUpdated: row.last_updated,
  progress: {
    currentSeason: row.progress_current_season || 1,
    currentEpisode: row.progress_current_episode || 0,
    completedEpisodes: JSON.parse(row.progress_completed_episodes || '[]')
  },
  // Metadata de sincronización
  _sync: {
    tursoId: row.id,
    tursoSyncedAt: row.synced_at,
    tursoLastUpdated: row.last_updated
  }
});

// Convertir registro local al formato Turso
const localMovieToTurso = (movie) => ({
  imdb_id: movie.imdbId,
  title: movie.title,
  year: movie.year,
  type: movie.type,
  poster: movie.poster,
  plot: movie.plot,
  genre: movie.genre,
  rating: movie.rating,
  total_seasons: movie.totalSeasons,
  status: movie.status,
  added_at: movie.addedAt,
  last_updated: movie.lastUpdated,
  progress_current_season: movie.progress?.currentSeason || 1,
  progress_current_episode: movie.progress?.currentEpisode || 0,
  progress_completed_episodes: JSON.stringify(movie.progress?.completedEpisodes || []),
  local_id: movie.id,
  synced_at: new Date().toISOString()
});

// ============================================
// PARTE 5: SINCRONIZACIÓN INTELIGENTE
// ============================================

// Obtener estado actual de sync metadata
const getSyncMeta = async (key) => {
  try {
    const result = await localDB.syncMeta.get(key);
    return result || { key, lastSyncedAt: null, localVersion: 0, cloudVersion: 0 };
  } catch {
    return { key, lastSyncedAt: null, localVersion: 0, cloudVersion: 0 };
  }
};

// Actualizar sync metadata
const updateSyncMeta = async (key, updates) => {
  const existing = await getSyncMeta(key);
  await localDB.syncMeta.put({ ...existing, ...updates, key });
};

// Sincronizar UNA película (lógica de resolución de conflictos)
const syncSingleMovie = async (localMovie) => {
  try {
    // 1. Buscar en Turso por imdb_id
    const tursoResult = await tursoClient.execute({
      sql: 'SELECT * FROM movies WHERE imdb_id = ?',
      args: [localMovie.imdbId]
    });

    if (tursoResult.rows.length === 0) {
      // No existe en Turso → Subir local
      console.log(`  ⬆️ Subiendo a nube: ${localMovie.title}`);
      const data = localMovieToTurso(localMovie);
      await tursoClient.execute({
        sql: `INSERT INTO movies (imdb_id, title, year, type, poster, plot, genre, rating, total_seasons, status, added_at, last_updated, progress_current_season, progress_current_episode, progress_completed_episodes, local_id, synced_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          data.imdb_id, data.title, data.year, data.type, data.poster, data.plot,
          data.genre, data.rating, data.total_seasons, data.status, data.added_at,
          data.last_updated, data.progress_current_season, data.progress_current_episode,
          data.progress_completed_episodes, data.local_id, data.synced_at
        ]
      });
      return { action: 'uploaded', movie: localMovie.title };
    }

    // 2. Existe en ambos → Comparar timestamps
    const cloudMovie = tursoResult.rows[0];
    const localTime = new Date(localMovie.lastUpdated).getTime();
    const cloudTime = new Date(cloudMovie.last_updated).getTime();

    if (localTime > cloudTime) {
      // Local es más reciente → Actualizar Turso
      console.log(`  🔄 Actualizando nube (local más reciente): ${localMovie.title}`);
      const data = localMovieToTurso(localMovie);
      await tursoClient.execute({
        sql: `UPDATE movies SET 
          title = ?, year = ?, type = ?, poster = ?, plot = ?, genre = ?, 
          rating = ?, total_seasons = ?, status = ?, last_updated = ?,
          progress_current_season = ?, progress_current_episode = ?, 
          progress_completed_episodes = ?, synced_at = ?
          WHERE imdb_id = ?`,
        args: [
          data.title, data.year, data.type, data.poster, data.plot,
          data.genre, data.rating, data.total_seasons, data.status, data.last_updated,
          data.progress_current_season, data.progress_current_episode,
          data.progress_completed_episodes, data.synced_at,
          data.imdb_id
        ]
      });
      return { action: 'uploaded', movie: localMovie.title };
    } else if (cloudTime > localTime) {
      // Cloud es más reciente → Actualizar local
      console.log(`  ⬇️ Actualizando local (nube más reciente): ${localMovie.title}`);
      await localDB.movies.update(localMovie.id, {
        title: cloudMovie.title,
        year: cloudMovie.year,
        type: cloudMovie.type,
        poster: cloudMovie.poster,
        plot: cloudMovie.plot,
        genre: cloudMovie.genre,
        rating: cloudMovie.rating,
        totalSeasons: cloudMovie.total_seasons,
        status: cloudMovie.status,
        lastUpdated: cloudMovie.last_updated,
        progress: {
          currentSeason: cloudMovie.progress_current_season || 1,
          currentEpisode: cloudMovie.progress_current_episode || 0,
          completedEpisodes: JSON.parse(cloudMovie.progress_completed_episodes || '[]')
        }
      });
      return { action: 'downloaded', movie: cloudMovie.title };
    } else {
      // Iguales → No hacer nada
      return { action: 'unchanged', movie: localMovie.title };
    }
  } catch (error) {
    console.error(`  ❌ Error sincronizando ${localMovie.title}:`, error);
    return { action: 'error', movie: localMovie.title };
  }
};

// Sincronizar episodios de una película
const syncMovieEpisodes = async (localMovie, tursoMovieId) => {
  try {
    // Obtener episodios locales
    const localEpisodes = await localDB.episodes
      .where('movieId')
      .equals(localMovie.id)
      .toArray();

    // Obtener episodios en Turso (usando imdb_id)
    const tursoResult = await tursoClient.execute({
      sql: 'SELECT * FROM episodes WHERE movie_imdb_id = ? OR imdb_id LIKE ?',
      args: [localMovie.imdbId, `${localMovie.imdbId}%`]
    });
    const cloudEpisodes = tursoResult.rows;

    // Por cada episodio local
    for (const localEp of localEpisodes) {
      const cloudEp = cloudEpisodes.find(
        e => e.season === localEp.season && e.episode === localEp.episode
      );

      if (!cloudEp) {
        // No existe en nube → Subir (usando INSERT OR IGNORE para evitar errores)
        try {
          await tursoClient.execute({
            sql: `INSERT OR IGNORE INTO episodes (imdb_id, movie_imdb_id, season, episode, episode_key, watched_at, local_id, synced_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              `${localMovie.imdbId}_S${localEp.season}E${localEp.episode}`,
              localMovie.imdbId,
              localEp.season,
              localEp.episode,
              localEp.episodeKey,
              localEp.watchedAt?.toISOString() || new Date().toISOString(),
              localEp.id,
              new Date().toISOString()
            ]
          });
        } catch (insertError) {
          // Ignorar error de inserción
          console.log(`  ⚠️ Episodio ${localEp.episodeKey} ya existe en nube`);
        }
      } else {
        // Comparar timestamps
        try {
          const localTime = new Date(localEp.watchedAt).getTime();
          const cloudTime = new Date(cloudEp.watched_at).getTime();

          if (cloudTime > localTime) {
            // Cloud más reciente → Actualizar local
            await localDB.episodes.update(localEp.id, {
              watchedAt: new Date(cloudEp.watched_at)
            });
          }
        } catch (updateError) {
          // Ignorar error de actualización
        }
      }
    }

    // Por cada episodio en cloud que no exista localmente
    for (const cloudEp of cloudEpisodes) {
      const existsLocally = localEpisodes.find(
        e => e.season === cloudEp.season && e.episode === cloudEp.episode
      );

      if (!existsLocally) {
        // Agregar a local
        await localDB.episodes.add({
          movieId: localMovie.id,
          season: cloudEp.season,
          episode: cloudEp.episode,
          episodeKey: cloudEp.episode_key,
          watchedAt: new Date(cloudEp.watched_at)
        });
      }
    }
  } catch (error) {
    console.error(`  ❌ Error sincronizando episodios:`, error);
  }
};

// ============================================
// PARTE 6: SINCRONIZACIÓN PRINCIPAL
// ============================================

export const smartSync = async () => {
  const results = { uploaded: 0, downloaded: 0, unchanged: 0, errors: 0 };
  
  try {
    console.log('🔄 Iniciando sincronización inteligente...');
    const startTime = Date.now();

    // 1. Obtener todas las películas locales
    const localMovies = await localDB.movies.toArray();
    console.log(`📊 Películas locales: ${localMovies.length}`);

    // 2. Obtener todas las películas en Turso
    const tursoResult = await tursoClient.execute('SELECT * FROM movies');
    const cloudMovies = tursoResult.rows;
    console.log(`📊 Películas en nube: ${cloudMovies.length}`);

    // 3. Encontrar películas que solo están en la nube (nuevas en cloud)
    const localImdbIds = new Set(localMovies.map(m => m.imdbId));
    const newInCloud = cloudMovies.filter(c => !localImdbIds.has(c.imdb_id));

    // 4. Sincronizar cada película local
    for (const localMovie of localMovies) {
      const result = await syncSingleMovie(localMovie);
      if (result.action === 'uploaded') results.uploaded++;
      else if (result.action === 'downloaded') results.downloaded++;
      else if (result.action === 'unchanged') results.unchanged++;
      else results.errors++;

      // Sincronizar episodios
      const tursoMovie = cloudMovies.find(c => c.imdb_id === localMovie.imdbId);
      if (tursoMovie) {
        await syncMovieEpisodes(localMovie, tursoMovie.id);
      }
    }

    // 5. Agregar películas que solo están en la nube
    for (const cloudMovie of newInCloud) {
      console.log(`  ⬇️ Importando de nube: ${cloudMovie.title}`);
      const localData = tursoMovieToLocal(cloudMovie);
      delete localData._sync;
      await localDB.movies.add(localData);
      results.downloaded++;
    }

    // 6. Actualizar metadata de sincronización
    await updateSyncMeta('global', {
      lastSyncedAt: new Date().toISOString(),
      localVersion: localMovies.length,
      cloudVersion: cloudMovies.length
    });

    const duration = Date.now() - startTime;
    console.log(`✅ Sincronización completada en ${duration}ms`);
    console.log(`   📤 Subidas: ${results.uploaded}, ⬇️ Descargas: ${results.downloaded}, ⏸️ Sin cambios: ${results.unchanged}`);

    return { success: true, results, duration };
  } catch (error) {
    console.error('❌ Error en sincronización:', error);
    return { success: false, error: error.message, results };
  }
};

// Sincronización simple (para usar después de cambios)
export const syncAfterChange = async () => {
  return smartSync();
};

// ============================================
// AUTO-SINCRONIZACIÓN (solo si hay cambios)
// ============================================

let syncInterval = null;

export const startAutoSync = (intervalMs = 60000) => {
  if (syncInterval) return;

  console.log('🔄 Iniciando auto-sincronización...');
  
  // Sincronización inicial
  smartSync();
  
  // Verificar cada X tiempo
  syncInterval = setInterval(() => {
    console.log('⏰ Verificando cambios...');
    smartSync();
  }, intervalMs);
};

export const stopAutoSync = () => {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('⏹ Auto-sincronización detenida');
  }
};

// Debug
export const debugDB = async () => {
  const movies = await localDB.movies.toArray();
  const episodes = await localDB.episodes.toArray();
  const syncMeta = await localDB.syncMeta.toArray();
  console.log('🎬 Películas locales:', movies);
  console.log('📺 Episodios locales:', episodes);
  console.log('🔄 Sync metadata:', syncMeta);
  return { movies, episodes, syncMeta };
};
