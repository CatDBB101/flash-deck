export interface FlashcardDB {
  id: string;
  word: string;
  meaning: string;
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  nextReviewDate: Date;
}

export interface SessionCard extends FlashcardDB {
  weight: number;         // น้ำหนักสำหรับการสุ่มรอบปัจจุบัน
  isPassed: boolean;      // ผ่านของวันนี้หรือยัง?
  isFirstAnswer: boolean; // ตอบครั้งแรกของวันนี้ไปหรือยัง?
}

// ==========================================
// ขั้นที่ 1: ดึงข้อมูลจาก DB และเตรียม Deck สำหรับวันนี้
// ==========================================
export function initTodaySession(dbCards: FlashcardDB[]): SessionCard[] {
  const today = new Date();

  // กรองเฉพาะการ์ดที่ถึงรอบทบทวน (nextReviewDate <= วันนี้)
  const dueCards = dbCards.filter(card => new Date(card.nextReviewDate) <= today);

  // เติม State ระยะสั้นให้การ์ดทุกใบ
  return dueCards.map(card => ({
    ...card,
    weight: 100, // เริ่มต้นน้ำหนักที่ 100
    isPassed: false,
    isFirstAnswer: true,
  }));
}

export function initTrainSession(dbCards: FlashcardDB[]): SessionCard[] {
  return dbCards.map(card => ({
    ...card,
    // Prioritize cards with lower easeFactor (harder) by giving them higher weight
    weight: Math.max(20, Math.round(200 / (card.easeFactor || 1))),
    isPassed: false, // In train mode we never mark as passed
    isFirstAnswer: true,
  }));
}

// ==========================================
// ขั้นที่ 2: สุ่มการ์ด (Weighted Random)
// ==========================================
export function drawCard(deck: SessionCard[], isTrainMode: boolean = false): SessionCard | null {
  // กรองเอาเฉพาะการ์ดที่ยังไม่ผ่าน (ถ้าไม่ใช่โหมด train)
  const activeCards = isTrainMode
    ? deck
    : deck.filter(c => !c.isPassed);

  if (activeCards.length === 0) return null; // เล่นครบหมดแล้ว!

  const totalWeight = activeCards.reduce((sum, card) => sum + card.weight, 0);
  let randomValue = Math.random() * totalWeight;

  for (const card of activeCards) {
    randomValue -= card.weight;
    if (randomValue <= 0) return card;
  }
  return activeCards[activeCards.length - 1];
}

// ==========================================
// ขั้นที่ 3: รับคำตอบ, อัปเดต SM-2 (ครั้งแรก) และ ปรับ Weight
// ==========================================
export function processAnswer(
  card: SessionCard,
  action: "KNOW_CORRECT" | "KNOW_INCORRECT" | "DONT_KNOW",
  answerTimeSec: number = 0
): SessionCard {
  const updatedCard = { ...card };

  // --- ส่วนที่ 1: อัปเดตระยะยาว (SM-2) ทำแค่ครั้งแรกที่ตอบในวันนี้ ---
  if (updatedCard.isFirstAnswer) {
    let quality = 0;
    if (action === "DONT_KNOW") quality = 0;
    else if (action === "KNOW_INCORRECT") quality = 2;
    else if (action === "KNOW_CORRECT") {
      quality = answerTimeSec < 3 ? 5 : answerTimeSec < 6 ? 4 : 3;
    }

    if (quality >= 3) {
      if (updatedCard.repetitions === 0) updatedCard.intervalDays = 1;
      else if (updatedCard.repetitions === 1) updatedCard.intervalDays = 6;
      else {
        updatedCard.intervalDays = Math.round(updatedCard.intervalDays * updatedCard.easeFactor);
      }
      updatedCard.repetitions += 1;
    } else {
      updatedCard.repetitions = 0;
      updatedCard.intervalDays = 1;
    }

    updatedCard.easeFactor = Math.max(1.3, updatedCard.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + updatedCard.intervalDays);
    updatedCard.nextReviewDate = nextDate;

    updatedCard.isFirstAnswer = false; // ปิดแฟล็ก เพื่อไม่ให้คำนวณ SM-2 ซ้ำในการตอบรอบหน้า
  }

  // --- ส่วนที่ 2: อัปเดตระยะสั้น (Weight) เพื่อจัดการรอบเล่น ---
  if (action === "DONT_KNOW") {
    updatedCard.weight *= 2.0;
  } else if (action === "KNOW_INCORRECT") {
    updatedCard.weight *= 1.5;
  } else if (action === "KNOW_CORRECT") {
    const timeMultiplier = answerTimeSec < 3 ? 0.3 : 0.8;
    updatedCard.weight *= timeMultiplier;
  }

  // ป้องกันค่าน้ำหนักเพี้ยน
  updatedCard.weight = Math.max(10, Math.min(updatedCard.weight, 1000));

  // --- ส่วนที่ 3: เช็คว่า "ผ่าน" รอบของวันนี้หรือยัง ---
  if (updatedCard.weight < 35) {
    updatedCard.isPassed = true;
  }

  return updatedCard;
}
