import { useState, useCallback } from "react";
import axios from "axios";

// OMDB API es una alternativa legal y gratuita a IMDB
// Necesitas obtener tu API key gratuita en: http://www.omdbapi.com/apikey.aspx
const OMDB_API_KEY = "c334785"; // API key de ejemplo (puedes cambiarla)
const OMDB_BASE_URL = "https://www.omdbapi.com/";

export const useOMDB = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Función para buscar películas/series por título
  // Es como el buscador de IMDB pero via API
  const searchMovies = useCallback(async (query) => {
    if (!query || query.length < 3) return [];

    setLoading(true);
    setError(null);

    try {
      // s=query busca por título, type=movie|series filtra el tipo
      const response = await axios.get(OMDB_BASE_URL, {
        params: {
          apikey: OMDB_API_KEY,
          s: query,
          type: "", // Dejamos vacío para buscar ambos (movie y series)
          page: 1,
        },
      });

      if (response.data.Response === "False") {
        return [];
      }

      // Devolvemos array de resultados con imdbID, Title, Year, Type, Poster
      return response.data.Search || [];
    } catch (err) {
      setError("Error buscando en OMDB");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Función para obtener detalles completos de una película/serie por ID
  // Esto nos da: trama, actores, temporadas, episodios, ratings, etc.
  const getMovieDetails = useCallback(async (imdbId) => {
    setLoading(true);

    try {
      const response = await axios.get(OMDB_BASE_URL, {
        params: {
          apikey: OMDB_API_KEY,
          i: imdbId,
          plot: "full", // Trama completa
          tomatoes: "true", // Ratings de Rotten Tomatoes si disponible
        },
      });

      return response.data.Response === "True" ? response.data : null;
    } catch (err) {
      setError("Error obteniendo detalles");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Función especial para series: obtiene info de temporadas específicas
  // IMDB/OMDB tienen datos de temporadas por separado
  const getSeasonDetails = useCallback(async (imdbId, seasonNumber) => {
    try {
      const response = await axios.get(OMDB_BASE_URL, {
        params: {
          apikey: OMDB_API_KEY,
          i: imdbId,
          Season: seasonNumber,
        },
      });

      return response.data.Response === "True" ? response.data : null;
    } catch (err) {
      return null;
    }
  }, []);

  return {
    searchMovies,
    getMovieDetails,
    getSeasonDetails,
    loading,
    error,
  };
};
