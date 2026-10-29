import NotionService from './notion';

export default class FlashcardManager {
  static async getCards(deck) {
    try {
      const cards = await NotionService.queryDatabase(deck.token, '3fdfb597c246808a8669e378cfc445f5');
      return cards;
    } catch (error) {
      console.error('Error fetching cards:', error);
      return [];
    }
  }

  static getRandomCard(cards) {
    if (!cards || cards.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * cards.length);
    return cards[randomIndex];
  }
}
