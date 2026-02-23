import React, { useState, useEffect, useRef } from 'react';
import { useOMDB } from '../hooks/useOMDB';
import { Search, Loader, Film, Tv } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';


// Componente de búsqueda con autocompletado estilo Netflix
export const SearchBar = ({ onSelect, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef(null);
  const { searchMovies, loading, getMovieDetails } = useOMDB();


  // Efecto de búsqueda con debounce (espera 500ms después de que dejes de escribir)
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length >= 3) {
        const searchResults = await searchMovies(query);
        setResults(searchResults);
        setIsOpen(true);
      } else {
        setResults([]);
        setIsOpen(false);
      }
    }, 500);


    return () => clearTimeout(timer);
  }, [query, searchMovies]);


  // Maneja la selección de una película/serie
  const handleSelect = async (movie) => {
    // Obtenemos los detalles completos antes de agregar
    const details = await getMovieDetails(movie.imdbID);
    if (details) {
      onSelect(details);
      setQuery('');
      setIsOpen(false);
      onClose?.();
    }
  };


  return (
    <div className="search-container">
      <div className="search-input-wrapper">
        <Search className="search-icon" size={20} />
        <input
          ref={inputRef}
          type="text"
          placeholder="Buscar películas o series..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="search-input"
        />
        {loading && <Loader className="spinner" size={20} />}
      </div>


      {/* Dropdown de resultados con animación */}
      <AnimatePresence>
        {isOpen && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="search-dropdown"
          >
            {results.map((movie) => (
              <div
                key={movie.imdbID}
                className="search-item"
                onClick={() => handleSelect(movie)}
              >
                {/* Poster miniatura o placeholder */}
                <div className="search-item-poster">
                  {movie.Poster !== 'N/A' ? (
                    <img src={movie.Poster} alt={movie.Title} />
                  ) : (
                    <div className="poster-placeholder">
                      {movie.Type === 'series' ? <Tv size={24} /> : <Film size={24} />}
                    </div>
                  )}
                </div>
                
                <div className="search-item-info">
                  <h4>{movie.Title}</h4>
                  <span className="search-item-meta">
                    {movie.Year} • {movie.Type === 'series' ? 'Serie' : 'Película'}
                  </span>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
