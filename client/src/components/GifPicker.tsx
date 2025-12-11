import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { fetchTrendingGifs, searchGifs, GiphyGif } from '../config/giphy';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const NUM_COLUMNS = 3;
const GIF_SIZE = (SCREEN_WIDTH - 40) / NUM_COLUMNS;

interface GifPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelectGif: (gifUrl: string) => void;
}

export default function GifPicker({ visible, onClose, onSelectGif }: GifPickerProps) {
  const { colors } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  // Load trending on mount
  useEffect(() => {
    if (visible) {
      loadTrending();
    }
  }, [visible]);

  const loadTrending = async () => {
    setLoading(true);
    const results = await fetchTrendingGifs(30);
    setGifs(results);
    setLoading(false);
  };

  const handleSearch = useCallback((text: string) => {
    setSearchQuery(text);
    
    // Clear previous timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    // Debounce search
    const timeout = setTimeout(async () => {
      if (text.trim().length > 0) {
        setLoading(true);
        const results = await searchGifs(text.trim(), 30);
        setGifs(results);
        setLoading(false);
      } else {
        loadTrending();
      }
    }, 400);

    setSearchTimeout(timeout);
  }, [searchTimeout]);

  const handleSelectGif = (gif: GiphyGif) => {
    // Use fixed_width for sending (good balance of quality and size)
    const gifUrl = gif.images.fixed_width.url;
    onSelectGif(gifUrl);
    onClose();
    setSearchQuery('');
  };

  const renderGif = ({ item }: { item: GiphyGif }) => (
    <TouchableOpacity
      style={styles.gifItem}
      onPress={() => handleSelectGif(item)}
      activeOpacity={0.7}
    >
      <Image
        source={{ uri: item.images.fixed_width.url }}
        style={styles.gifImage}
        resizeMode="cover"
      />
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Drag Handle */}
        <View style={styles.dragHandle} />
        
        {/* Header with Search */}
        <View style={[styles.header, { backgroundColor: colors.background }]}>
          <View style={[styles.searchContainer, { backgroundColor: colors.surfaceSecondary }]}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search GIFs..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={handleSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => handleSearch('')}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>



        {/* GIF Grid */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : (
          <FlatList
            key={`gif-grid-${NUM_COLUMNS}`}
            data={gifs}
            renderItem={renderGif}
            keyExtractor={(item) => item.id}
            numColumns={NUM_COLUMNS}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                  No GIFs found
                </Text>
              </View>
            }
          />
        )}

        {/* GIPHY Attribution (Required) */}
        <View style={[styles.attribution, { backgroundColor: colors.surface }]}>
          <Text style={[styles.attributionText, { color: colors.textMuted }]}>
            Powered by
          </Text>
          <Image
            source={{ uri: 'https://giphy.com/static/img/giphy_logo_square_social.png' }}
            style={styles.giphyLogo}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    height: SCREEN_HEIGHT * 0.55,
    marginTop: 'auto',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  dragHandle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(128,128,128,0.4)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridContent: {
    paddingHorizontal: 8,
    paddingBottom: 50,
  },
  gifItem: {
    width: GIF_SIZE,
    height: GIF_SIZE * 0.8,
    margin: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  gifImage: {
    width: '100%',
    height: '100%',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 16,
  },
  attribution: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 4,
  },
  attributionText: {
    fontSize: 10,
  },
  giphyLogo: {
    width: 50,
    height: 16,
    resizeMode: 'contain',
  },
});
