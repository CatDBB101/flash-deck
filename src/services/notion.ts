export default class NotionService {
  static async queryDatabase(token: string, databaseId: string) {
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(`Notion API error: ${response.status}`);
    }

    const data = await response.json();

    // Map Notion's complex structure to a simple card object
    return data.results.map((page: any) => {
      const properties = page.properties;

      const front = properties.Front?.rich_text?.[0]?.plain_text || 'Unknown';
      const back = properties.Back?.rich_text?.[0]?.plain_text || 'No translation';

      return {
        id: page.id,
        word: front,
        meaning: back,
        repetitions: properties.Repetitions?.number || 0,
        easeFactor: properties.EaseFactor?.number || 2.5,
        intervalDays: properties.IntervalDays?.number || 0,
        nextReviewDate: properties.NextReviewDate?.date?.start || new Date().toISOString(),
      };
    });
  }

  static async updateCard(token: string, pageId: string, card: any) {
    const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          Repetitions: { number: card.repetitions },
          EaseFactor: { number: card.easeFactor },
          IntervalDays: { number: card.intervalDays },
          NextReviewDate: { date: { start: card.nextReviewDate.toISOString() } },
        },
      }),
    });

    return response.ok;
  }

  static async updatePage(token: string, pageId: string, text: string) {
    const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          Translate: {
            rich_text: [{ text: { content: text } }],
          },
        },
      }),
    });

    return response.ok;
  }

  static async addCard(token: string, cardData: any) {
    // หมายเหตุ: ในการสร้าง Page ใหม่ เราต้องระบุ parent (Database ID)
    // เนื่องจากในโครงสร้างปัจจุบัน token ถูกเก็บไว้ใน deck
    // และเราใช้ databaseId แบบ hardcoded ใน queryDatabase
    // ดังนั้นเราจะใช้ ID เดียวกันนั้นในการสร้าง Page
    const databaseId = '3fdfb597c246808a8669e378cfc445f5';

    const response = await fetch(`https://api.notion.com/v1/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties: {
          Front: {
            rich_text: [{ text: { content: cardData.Front } }],
          },
          Back: {
            rich_text: [{ text: { content: cardData.Back } }],
          },
          Repetitions: { number: cardData.Repetitions },
          EaseFactor: { number: cardData.EaseFactor },
          IntervalDays: { number: cardData.IntervalDays },
          NextReviewDate: { date: { start: cardData.NextReviewDate } },
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Notion API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    return await response.json();
  }
}
