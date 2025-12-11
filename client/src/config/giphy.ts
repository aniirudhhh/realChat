// GIPHY API Configuration
const GIPHY_API_KEY = '1pXGKomZrntGVhzaJPCts3jNgXwtXjHS';
const GIPHY_API_BASE = 'https://api.giphy.com/v1/gifs';

export interface GiphyGif {
  id: string;
  title: string;
  images: {
    fixed_height: {
      url: string;
      width: string;
      height: string;
    };
    fixed_width: {
      url: string;
      width: string;
      height: string;
    };
    original: {
      url: string;
      width: string;
      height: string;
    };
    preview_gif: {
      url: string;
    };
  };
}

export interface GiphyResponse {
  data: GiphyGif[];
  pagination: {
    total_count: number;
    count: number;
    offset: number;
  };
}

// Fetch trending GIFs
export const fetchTrendingGifs = async (limit: number = 25): Promise<GiphyGif[]> => {
  try {
    const response = await fetch(
      `${GIPHY_API_BASE}/trending?api_key=${GIPHY_API_KEY}&limit=${limit}&rating=pg-13`
    );
    const data: GiphyResponse = await response.json();
    return data.data;
  } catch (error) {
    console.error('Error fetching trending GIFs:', error);
    return [];
  }
};

// Search GIFs
export const searchGifs = async (query: string, limit: number = 25): Promise<GiphyGif[]> => {
  try {
    const response = await fetch(
      `${GIPHY_API_BASE}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=${limit}&rating=pg-13`
    );
    const data: GiphyResponse = await response.json();
    return data.data;
  } catch (error) {
    console.error('Error searching GIFs:', error);
    return [];
  }
};
