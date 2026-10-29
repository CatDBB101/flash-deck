import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate
} from 'react-native-reanimated';
import NotionService from '../../services/notion';
import * as SpacedRepetitionManager from '../../services/spaced-repetition';
import { useTheme } from '../theme-context';


const { width } = Dimensions.get('window');

export default function StudyScreen() {
  const { theme, isDark } = useTheme();
  const { id, mode } = useLocalSearchParams();
  const isTrainMode = mode === 'train';
  const [sessionDeck, setSessionDeck] = useState<any[]>([]);
  const [currentCard, setCurrentCard] = useState<any>(null);
  const [isShowingAnswer, setIsShowingAnswer] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [score, setScore] = useState(0);
  const [startTime, setStartTime] = useState(0);

  // Animation Values
  const translateX = useSharedValue(0);

  useEffect(() => {
    initStudy();
  }, []);

  const initStudy = async () => {
    try {
      const storedDecks = await AsyncStorage.getItem('@my_decks');
      if (!storedDecks) throw new Error('No decks found');

      const decks = JSON.parse(storedDecks);
      const deck = decks.find((d: any) => d.id === id);
      if (!deck) throw new Error('Deck not found');

      const cards = await NotionService.queryDatabase(deck.token, '3fdfb597c246808a8669e378cfc445f5');

      const sessionCards = isTrainMode
        ? SpacedRepetitionManager.initTrainSession(cards)
        : SpacedRepetitionManager.initTodaySession(cards);

      setSessionDeck(sessionCards);
      setCurrentCard(SpacedRepetitionManager.drawCard(sessionCards, isTrainMode));
      setStartTime(Date.now());
    } catch (error) {
      console.error(error);
      alert('เกิดข้อผิดพลาดในการดึงข้อมูล');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnswer = async (action: "KNOW_CORRECT" | "KNOW_INCORRECT" | "DONT_KNOW") => {
    if (!currentCard) return;

    const answerTimeSec = (Date.now() - startTime) / 1000;
    const updatedCard = SpacedRepetitionManager.processAnswer(currentCard, action, answerTimeSec);

    // ใน Train Mode ห้ามให้การ์ด "ผ่าน" เพื่อให้สามารถสุ่มเจอได้เรื่อยๆ
    if (isTrainMode) {
      updatedCard.isPassed = false;
    }

    // Update score (Fluency Bonus: Exponential Decay)
    if (action === "KNOW_CORRECT") {
      const baseScore = 10;
      const maxBonus = 10;
      const decayConstant = 0.5;
      const timeBonus = Math.round(maxBonus * Math.exp(-decayConstant * answerTimeSec));
      setScore(s => s + baseScore + timeBonus);
    } else if (action === "DONT_KNOW") {
      setScore(s => Math.max(0, s - 5));
    }

    // Update deck state
    const updatedDeck = sessionDeck.map(c => c.id === updatedCard.id ? updatedCard : c);
    setSessionDeck(updatedDeck);

    // (Removed: Immediate update to Notion)

    // Move to next card
    setIsShowingAnswer(false);
    translateX.value = 0;
    const next = SpacedRepetitionManager.drawCard(updatedDeck, isTrainMode);
    setCurrentCard(next);
    setStartTime(Date.now());
  };

  const gesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
    })
    .onEnd((event) => {
      const swipeThreshold = width * 0.3;

      if (event.translationX < -swipeThreshold) {
        // Swipe Left: User doesn't know or answers Incorrectly
        if (!isShowingAnswer) {
          // First swipe left: Show answer first
          runOnJS(setIsShowingAnswer)(true);
          translateX.value = withSpring(0); // Reset position to center
        } else {
          // Second swipe left: Confirm "Don't Know" and move to next
          runOnJS(handleAnswer)("DONT_KNOW");
        }
      } else if (event.translationX > swipeThreshold) {
        // Swipe Right: User knows the answer
        if (!isShowingAnswer) {
          // First swipe right: Show answer ONLY
          runOnJS(setIsShowingAnswer)(true);
          translateX.value = withSpring(0); // Reset position to center
        } else {
          // Second swipe right: Confirm it's Correct and move to next
          runOnJS(handleAnswer)("KNOW_CORRECT");
        }
      } else {
        translateX.value = withSpring(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
      backgroundColor: interpolate(
        translateX.value,
        [-width * 0.5, 0, width * 0.5],
        isDark
          ? ['#C0A0A0', '#1E1E1E', '#A0C0A0']
          : ['#FFCCCC', '#FFFFFF', '#CCFFCC']
      ),
    };
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={[styles.loadingText, isDark && styles.loadingTextDark]}>กำลังเตรียมคำศัพท์...</Text>
      </View>
    );
  }

  if (!currentCard) {
    return (
      <View style={[styles.center, isDark && styles.centerDark]}>
        <Ionicons name="checkmark-circle-outline" size={64} color="#4CAF50" />
        <Text style={[styles.emptyText, isDark && styles.emptyTextDark]}>ยินดีด้วย! คุณทบทวนครบทุกคำแล้ว</Text>
        <Text style={[styles.finalScore, isDark && styles.finalScoreDark]}>คะแนนรวม: {score}</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={async () => {
            try {
              if (!isTrainMode) {
                const storedDecks = await AsyncStorage.getItem('@my_decks');
                const decks = JSON.parse(storedDecks || '[]');
                const deck = decks.find((de: any) => de.id === id);

                if (deck) {
                  // Update all cards in the session deck to Notion
                  const updates = sessionDeck.map(card =>
                    NotionService.updateCard(deck.token, card.id, card)
                  );
                  await Promise.all(updates);
                }
              }
            } catch (e) {
              console.error('Failed to sync session to Notion:', e);
            } finally {
              router.replace('/');
            }
          }}
        >
          <Text style={styles.backButtonText}>กลับหน้าหลัก</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={[styles.container, isDark && styles.containerDark]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backIcon}>
            <Ionicons name="arrow-back" size={24} color={isDark ? "#FFF" : "#333"} />
          </TouchableOpacity>
          <View style={[styles.scoreContainer, isDark && styles.scoreContainerDark]}>
            <Text style={[styles.scoreText, isDark && styles.scoreTextDark]}>Score: {score}</Text>
          </View>
          <View style={{ width: 24 }} />
        </View>

        {isTrainMode && (
          <View style={[styles.trainBadge, isDark && styles.trainBadgeDark]}>
            <Text style={[styles.trainBadgeText, isDark && styles.trainBadgeTextDark]}>
              🚀 Training Mode
            </Text>
          </View>
        )}


        <View style={styles.cardContainer}>
          <GestureDetector gesture={gesture}>
            <Animated.View style={[styles.card, animatedStyle]}>
              <Text style={[styles.cardLabel, isDark && styles.cardLabelDark]}>
                {!isShowingAnswer ? 'คำศัพท์' : 'คำแปล'}
              </Text>
              <Text style={[styles.cardText, { color: isShowingAnswer ? '#007AFF' : (isDark ? '#FFF' : '#333') }]}>
                {!isShowingAnswer ? currentCard.word : currentCard.meaning}
              </Text>

              <View style={styles.hintContainer}>
                <View style={styles.hintItem}>
                  <Ionicons name="arrow-back" size={20} color="#FF5252" />
                  <Text style={[styles.hintText, isDark && styles.hintTextDark]}>
                    {!isShowingAnswer ? 'ไม่รู้/ผิด' : 'เลื่อนเพื่อผ่าน'}
                  </Text>
                </View>
                <View style={styles.hintItem}>
                  <Ionicons name="arrow-forward" size={20} color="#4CAF50" />
                  <Text style={[styles.hintText, isDark && styles.hintTextDark]}>
                    {!isShowingAnswer ? 'รู้/ถูก' : 'เลื่อนเพื่อผ่าน'}
                  </Text>
                </View>
              </View>
            </Animated.View>
          </GestureDetector>
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  containerDark: {
    backgroundColor: '#191919',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  scoreContainer: {
    backgroundColor: '#F1F1EF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 4,
  },
  scoreContainerDark: {
    backgroundColor: '#2F2F2F',
  },
  scoreText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#37352F',
  },
  scoreTextDark: {
    color: '#FFFFFF',
  },
  backIcon: {
    padding: 8,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  centerDark: {
    backgroundColor: '#191919',
  },
  trainBadge: {
    alignSelf: 'center',
    backgroundColor: '#FFD700',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 10,
  },
  trainBadgeDark: {
    backgroundColor: '#B8860B',
  },
  trainBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000',
  },
  trainBadgeTextDark: {
    color: '#FFF',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 14,
    color: '#787774',
  },
  loadingTextDark: {
    color: '#9B9B9B',
  },
  emptyText: {
    marginTop: 15,
    fontSize: 14,
    color: '#787774',
    textAlign: 'center',
  },
  emptyTextDark: {
    color: '#9B9B9B',
  },
  finalScore: {
    fontSize: 20,
    fontWeight: '600',
    color: '#37352F',
    marginTop: 10,
    marginBottom: 20,
  },
  finalScoreDark: {
    color: '#FFFFFF',
  },
  backButton: {
    backgroundColor: '#2383E2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
  },
  backButtonText: {
    color: 'white',
    fontWeight: '500',
    fontSize: 14,
  },
  cardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: width * 0.85,
    height: 450,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    borderWidth: 1,
    borderColor: '#E9E9E8',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardLabel: {
    position: 'absolute',
    top: 20,
    fontSize: 12,
    fontWeight: '500',
    color: '#787774',
    textTransform: 'uppercase',
  },
  cardLabelDark: {
    color: '#9B9B9B',
  },
  cardText: {
    fontSize: 28,
    fontWeight: '600',
    textAlign: 'center',
  },
  hintContainer: {
    position: 'absolute',
    bottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '80%',
  },
  hintItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hintText: {
    fontSize: 12,
    color: '#787774',
  },
  hintTextDark: {
    color: '#9B9B9B',
  },
});
