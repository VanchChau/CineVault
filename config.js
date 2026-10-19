// ─── CineVault v2 — Configuration ───────────────────────────────────────────
window.CV_CONFIG = {
  TMDB_TOKEN: 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI0YTVkNTJlZTQ3ZjlkM2EyZTkzZTgwMjNkMjM4ZDRjOCIsIm5iZiI6MTc5MjQxMTY3Ny43NjYsInN1YiI6IjZhZDYwODFkMWNjZDNmOGQ4YzIwZTkyYiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.sAaMUbc4BPz8OlGJlJXpEPelVAOc1Y6d3SfvMCEcf2I',
  TMDB_BASE: 'https://api.themoviedb.org/3',
  IMG_BASE: 'https://image.tmdb.org/t/p/',
  IMG_W342: 'https://image.tmdb.org/t/p/w342',
  IMG_W780: 'https://image.tmdb.org/t/p/w780',
  IMG_ORIG: 'https://image.tmdb.org/t/p/original',

  GENRES: {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
    99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
    27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
    10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western'
  },

  BINGO_CELLS: [
    { icon: '🎭', text: 'Watch a drama' }, { icon: '🌍', text: 'Foreign film' },
    { icon: '👴', text: 'Film before 1980' }, { icon: '🏆', text: 'Oscar winner' },
    { icon: '🚀', text: 'Sci-Fi movie' }, { icon: '😂', text: 'A comedy' },
    { icon: '👻', text: 'Horror film' }, { icon: '📚', text: 'Based on a book' },
    { icon: '🎬', text: 'Watch a sequel' }, { icon: '🌟', text: 'Director debut' },
    { icon: '⭐', text: 'FREE SPACE', isFree: true }, { icon: '🎶', text: 'Musical' },
    { icon: '🦸', text: 'Superhero movie' }, { icon: '🌙', text: 'After 11pm' },
    { icon: '👨‍👩‍👧', text: 'Watch with family' }, { icon: '🏅', text: 'IMDb Top 250' },
    { icon: '🎃', text: 'Animated film' }, { icon: '🌎', text: 'Another era' },
    { icon: '🔍', text: 'Mystery film' }, { icon: '💥', text: 'Action blockbuster' },
    { icon: '🌿', text: 'Nature/wildlife' }, { icon: '🔮', text: 'Fantasy world' },
    { icon: '💔', text: 'Sad ending' }, { icon: '📺', text: 'Based on TV show' },
    { icon: '🎥', text: 'Black & white film' },
  ],
};
